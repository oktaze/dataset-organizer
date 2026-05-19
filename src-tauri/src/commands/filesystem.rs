//! Filesystem IPC commands. Pure IO — no business logic (per CLAUDE.md).
//!
//! All commands are async and run their blocking IO/decode work inside
//! `spawn_blocking`, so directory scans and image decoding never block the
//! main (UI) thread — that previously froze the app during import.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::io::{Cursor, Write};
use std::path::Path;
use tauri::Manager;

#[derive(Serialize)]
pub struct ImageMeta {
    pub filename: String,
    pub filepath: String,
    pub width: u32,
    pub height: u32,
}

/// Result of an import scan: readable images plus the paths that *looked*
/// like images but could not be decoded, so the UI can tell the user.
#[derive(Serialize)]
pub struct ImportResult {
    pub images: Vec<ImageMeta>,
    pub skipped: Vec<String>,
}

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif"];

fn has_image_ext(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Write `bytes` to `target` atomically: write a sibling temp file in the
/// **same directory**, then `rename` over the target. `rename` is atomic
/// within a filesystem and replaces an existing file on both Unix and
/// Windows, so a crash mid-write never leaves a half-written caption.
fn write_atomic(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = target.parent().unwrap_or_else(|| Path::new("."));
    let stem = target
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = dir.join(format!(
        ".{stem}.{}.{nanos}.tmp",
        std::process::id()
    ));
    std::fs::write(&tmp, bytes)
        .map_err(|e| format!("write {}: {e}", tmp.display()))?;
    if let Err(e) = std::fs::rename(&tmp, target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!(
            "rename {} -> {}: {e}",
            tmp.display(),
            target.display()
        ));
    }
    Ok(())
}

/// Metadata for a single path, or `None` if it is not a readable image
/// (wrong extension, not a file, corrupt header). Dimensions are read from
/// the header only (fast, no full decode).
fn meta_for_file(p: &Path) -> Option<ImageMeta> {
    if !p.is_file() || !has_image_ext(p) {
        return None;
    }
    let (width, height) = image::image_dimensions(p).ok()?;
    let filename = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();
    Some(ImageMeta {
        filename,
        filepath: p.to_string_lossy().to_string(),
        width,
        height,
    })
}

/// Enumerate image files in `path`, returning metadata + dimensions.
/// Files that look like images but fail to decode are reported in
/// `skipped` (not fatal); unrelated files in the folder are ignored.
#[tauri::command]
pub async fn read_images_from_dir(path: String) -> Result<ImportResult, String> {
    blocking(move || {
        let entries = std::fs::read_dir(&path)
            .map_err(|e| format!("read_dir {path}: {e}"))?;

        let mut images: Vec<ImageMeta> = Vec::new();
        let mut skipped: Vec<String> = Vec::new();
        for entry in entries.flatten() {
            let p = entry.path();
            match meta_for_file(&p) {
                Some(m) => images.push(m),
                // Only report files that look like images but failed to
                // decode — not every unrelated file in the folder.
                None if p.is_file() && has_image_ext(&p) => {
                    skipped.push(p.to_string_lossy().to_string());
                }
                None => {}
            }
        }

        images.sort_by(|a, b| a.filename.cmp(&b.filename));
        skipped.sort();
        Ok(ImportResult { images, skipped })
    })
    .await
}

/// Metadata for an explicit list of image file paths (multi-file import,
/// possibly spanning different folders). Any hand-picked path that cannot
/// be decoded is reported in `skipped` — mirrors `read_images_from_dir`.
#[tauri::command]
pub async fn read_images_meta(paths: Vec<String>) -> Result<ImportResult, String> {
    blocking(move || {
        let mut images: Vec<ImageMeta> = Vec::new();
        let mut skipped: Vec<String> = Vec::new();
        for s in &paths {
            match meta_for_file(Path::new(s)) {
                Some(m) => images.push(m),
                None => skipped.push(s.clone()),
            }
        }

        images.sort_by(|a, b| a.filename.cmp(&b.filename));
        Ok(ImportResult { images, skipped })
    })
    .await
}

/// Decode an image, downscale to fit `max` px (aspect preserved) and return
/// a `data:image/jpeg;base64,...` URL for use as a gallery thumbnail.
///
/// Results are cached on disk under `<app_data>/thumb-cache`, keyed by
/// path + file size + mtime + `max`, so re-scrolling the gallery (or
/// restarting the app) skips the expensive full decode. Any edit to the
/// source file changes its size/mtime and invalidates the entry. `app` is
/// injected by Tauri — the JS signature is unchanged.
#[tauri::command]
pub async fn get_image_thumbnail(
    app: tauri::AppHandle,
    path: String,
    max: Option<u32>,
) -> Result<String, String> {
    blocking(move || {
        let size = max.unwrap_or(200);

        let cache_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app_data_dir: {e}"))?
            .join("thumb-cache");

        let meta = std::fs::metadata(&path)
            .map_err(|e| format!("stat {path}: {e}"))?;
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut hasher);
        meta.len().hash(&mut hasher);
        mtime.hash(&mut hasher);
        size.hash(&mut hasher);
        let cache_file =
            cache_dir.join(format!("{:016x}.jpg", hasher.finish()));

        let encode = |bytes: &[u8]| {
            let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
            format!("data:image/jpeg;base64,{b64}")
        };

        if let Ok(cached) = std::fs::read(&cache_file) {
            return Ok(encode(&cached));
        }

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

        // Best-effort cache write: a failure here must not fail the request.
        if std::fs::create_dir_all(&cache_dir).is_ok() {
            let _ = write_atomic(&cache_file, &buf);
        }

        Ok(encode(&buf))
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
        write_atomic(&txt_path, caption.as_bytes())
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
            write_atomic(&txt_path, it.caption.as_bytes())?;

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
