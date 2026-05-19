import { invoke } from "@tauri-apps/api/core";

export interface ImageMeta {
  filename: string;
  filepath: string;
  width: number;
  height: number;
}

export interface ImportResult {
  images: ImageMeta[];
  /** Paths that looked like images but could not be decoded. */
  skipped: string[];
}

export interface ExportItem {
  source_path: string;
  target_name: string;
  caption: string;
  subdir?: string;
}

/** When passed, `exportDataset` also writes a HF dataset card (README.md)
 *  and metadata.jsonl so the folder loads as a `datasets` imagefolder. */
export interface DatasetMeta {
  project_name: string;
  description?: string;
}

/**
 * Typed wrappers around the Rust IPC commands. Tauri v2 maps camelCase
 * JS keys to the snake_case Rust parameter names automatically.
 */
export const tauri = {
  readImagesFromDir: (path: string): Promise<ImportResult> =>
    invoke<ImportResult>("read_images_from_dir", { path }),

  readImagesMeta: (paths: string[]): Promise<ImportResult> =>
    invoke<ImportResult>("read_images_meta", { paths }),

  writeCaptionFile: (imagePath: string, caption: string): Promise<void> =>
    invoke<void>("write_caption_file", { imagePath, caption }),

  /** Copy an imported image into the app-managed library. Returns the
   *  managed absolute path (or the input unchanged if already inside it). */
  importIntoLibrary: (
    projectId: string,
    imageId: string,
    sourcePath: string,
  ): Promise<string> =>
    invoke<string>("import_into_library", {
      projectId,
      imageId,
      sourcePath,
    }),

  /** Delete a project's entire managed library folder (post project delete). */
  removeLibraryProject: (projectId: string): Promise<void> =>
    invoke<void>("remove_library_project", { projectId }),

  getImageThumbnail: (path: string, max?: number): Promise<string> =>
    invoke<string>("get_image_thumbnail", { path, max }),

  exportDataset: (
    outputDir: string,
    items: ExportItem[],
    metadata?: DatasetMeta,
  ): Promise<number> =>
    invoke<number>("export_dataset", { outputDir, items, metadata }),

  exportDatasetZip: (
    outputPath: string,
    items: ExportItem[],
  ): Promise<number> =>
    invoke<number>("export_dataset_zip", { outputPath, items }),

  hfExportTmpdir: (): Promise<string> =>
    invoke<string>("hf_export_tmpdir"),

  removeDir: (path: string): Promise<void> =>
    invoke<void>("remove_dir", { path }),

  dbQuery: <T = unknown>(sql: string, params: unknown[]): Promise<T[]> =>
    invoke<T[]>("db_query", { sql, params }),

  dbExecute: (sql: string, params: unknown[]): Promise<number> =>
    invoke<number>("db_execute", { sql, params }),

  startSidecar: (): Promise<number> => invoke<number>("start_sidecar"),

  stopSidecar: (): Promise<void> => invoke<void>("stop_sidecar"),

  getSidecarPort: (): Promise<number | null> =>
    invoke<number | null>("get_sidecar_port"),
};
