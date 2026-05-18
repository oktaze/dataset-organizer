//! Filesystem IPC commands. Pure IO — no business logic (per CLAUDE.md).
//!
//! All commands are async and run their blocking IO/decode work inside
//! `spawn_blocking`, so directory scans and image decoding never block the
//! main (UI) thread — that previously froze the app during import.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::{Cursor, Write};
use std::path::Path;

#[derive(Serialize)]
pub struct ImageMeta {
    pub filename: String,
    pub filepath: String,
    pub width: u32,
    pub height: u32,
}

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif"];

async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Enumerate image files in `path`, returning metadata + dimensions.
/// Dimensions are read from the header only (fast, no full decode).
/// Unreadable/corrupt files are skipped, not fatal.
#[tauri::command]
pub async fn read_images_from_dir(path: String) -> Result<Vec<ImageMeta>, String> {
    blocking(move || {
        let entries = std::fs::read_dir(&path)
            .map_err(|e| format!("read_dir {path}: {e}"))?;

        let mut images: Vec<ImageMeta> = Vec::new();
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let ext_ok = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false);
            if !ext_ok {
                continue;
            }
            let (width, height) = match image::image_dimensions(&p) {
                Ok(d) => d,
                Err(_) => continue,
            };
            let filename = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            images.push(ImageMeta {
                filename,
                filepath: p.to_string_lossy().to_string(),
                width,
                height,
            });
        }

        images.sort_by(|a, b| a.filename.cmp(&b.filename));
        Ok(images)
    })
    .await
}

/// Decode an image, downscale to fit `max` px (aspect preserved) and return
/// a `data:image/jpeg;base64,...` URL for use as a gallery thumbnail.
#[tauri::command]
pub async fn get_image_thumbnail(
    path: String,
    max: Option<u32>,
) -> Result<String, String> {
    blocking(move || {
        let size = max.unwrap_or(200);
        let img = image::ImageReader::open(&path)
            .map_err(|e| format!("open {path}: {e}"))?
            .with_guessed_format()
            .map_err(|e| format!("format {path}: {e}"))?
            .decode()
            .map_err(|e| format!("decode {path}: {e}"))?;

        let thumb = img.thumbnail(size, size).to_rgb8();

        let mut buf: Vec<u8> = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut Cursor::new(&mut buf),
            80,
        )
        .encode(
            thumb.as_raw(),
            thumb.width(),
            thumb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| format!("encode: {e}"))?;

        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        Ok(format!("data:image/jpeg;base64,{b64}"))
    })
    .await
}

/// Write `caption` to a sibling `.txt` file next to the image
/// (e.g. `cat.png` -> `cat.txt`).
#[tauri::command]
pub async fn write_caption_file(
    image_path: String,
    caption: String,
) -> Result<(), String> {
    blocking(move || {
        let txt_path = Path::new(&image_path).with_extension("txt");
        std::fs::write(&txt_path, caption)
            .map_err(|e| format!("write {}: {e}", txt_path.display()))
    })
    .await
}

/// One image to export. The frontend owns all selection/caption logic
/// (per CLAUDE.md); this command is pure file IO.
#[derive(Deserialize)]
pub struct ExportItem {
    pub source_path: String,
    /// Original filename; the extension is taken from `source_path`.
    pub target_name: String,
    pub caption: String,
    /// Optional sub-folder (e.g. costume name) under the output dir.
    pub subdir: Option<String>,
}

fn sanitize(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    cleaned.trim().trim_matches('.').to_string()
}

struct Resolved {
    /// Sanitized sub-folder (costume), or "" for the root.
    ns: String,
    stem: String,
    ext: String,
}

/// Resolve an item's sanitized folder/stem/ext, made unique within its
/// folder via `used` (keyed by `"<ns>/<stem>.<ext>"`).
fn resolve(it: &ExportItem, used: &mut HashSet<String>) -> Resolved {
    let ns = it.subdir.as_deref().map(sanitize).unwrap_or_default();
    let ext = Path::new(&it.source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let base = {
        let stem = Path::new(&it.target_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("image");
        let s = sanitize(stem);
        if s.is_empty() { "image".to_string() } else { s }
    };

    let mut stem = base.clone();
    let mut n = 1;
    while !used.insert(format!("{ns}/{stem}.{ext}")) {
        n += 1;
        stem = format!("{base}_{n}");
    }
    Resolved { ns, stem, ext }
}

/// Copy each image into `output_dir` (optionally under a per-item subdir)
/// and write its caption to a sibling `.txt`. Returns images written.
#[tauri::command]
pub async fn export_dataset(
    output_dir: String,
    items: Vec<ExportItem>,
) -> Result<usize, String> {
    blocking(move || {
        let root = Path::new(&output_dir);
        std::fs::create_dir_all(root)
            .map_err(|e| format!("create {}: {e}", root.display()))?;

        let mut used: HashSet<String> = HashSet::new();
        let mut count = 0usize;

        for it in &items {
            let r = resolve(it, &mut used);
            let dir = if r.ns.is_empty() {
                root.to_path_buf()
            } else {
                root.join(&r.ns)
            };
            std::fs::create_dir_all(&dir)
                .map_err(|e| format!("create {}: {e}", dir.display()))?;

            let img_path = dir.join(format!("{}.{}", r.stem, r.ext));
            let txt_path = dir.join(format!("{}.txt", r.stem));

            std::fs::copy(&it.source_path, &img_path).map_err(|e| {
                format!("copy {} -> {}: {e}", it.source_path, img_path.display())
            })?;
            std::fs::write(&txt_path, &it.caption)
                .map_err(|e| format!("write {}: {e}", txt_path.display()))?;

            count += 1;
        }

        Ok(count)
    })
    .await
}

/// Same dataset, packed into a single `.zip` (image + sibling `.txt`,
/// preserving the per-costume sub-folders). For cloud trainers.
#[tauri::command]
pub async fn export_dataset_zip(
    output_path: String,
    items: Vec<ExportItem>,
) -> Result<usize, String> {
    blocking(move || {
        let file = std::fs::File::create(&output_path)
            .map_err(|e| format!("create {output_path}: {e}"))?;
        let mut zip = zip::ZipWriter::new(file);

        let mut used: HashSet<String> = HashSet::new();
        let mut count = 0usize;

        for it in &items {
            let r = resolve(it, &mut used);
            let prefix = if r.ns.is_empty() {
                String::new()
            } else {
                format!("{}/", r.ns)
            };
            let bytes = std::fs::read(&it.source_path)
                .map_err(|e| format!("read {}: {e}", it.source_path))?;

            zip.start_file(
                format!("{prefix}{}.{}", r.stem, r.ext),
                zip::write::SimpleFileOptions::default(),
            )
            .map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;

            zip.start_file(
                format!("{prefix}{}.txt", r.stem),
                zip::write::SimpleFileOptions::default(),
            )
            .map_err(|e| e.to_string())?;
            zip.write_all(it.caption.as_bytes())
                .map_err(|e| e.to_string())?;

            count += 1;
        }

        zip.finish().map_err(|e| e.to_string())?;
        Ok(count)
    })
    .await
}
