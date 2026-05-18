import { invoke } from "@tauri-apps/api/core";

export interface ImageMeta {
  filename: string;
  filepath: string;
  width: number;
  height: number;
}

export interface ExportItem {
  source_path: string;
  target_name: string;
  caption: string;
  subdir?: string;
}

/**
 * Typed wrappers around the Rust IPC commands. Tauri v2 maps camelCase
 * JS keys to the snake_case Rust parameter names automatically.
 */
export const tauri = {
  readImagesFromDir: (path: string): Promise<ImageMeta[]> =>
    invoke<ImageMeta[]>("read_images_from_dir", { path }),

  writeCaptionFile: (imagePath: string, caption: string): Promise<void> =>
    invoke<void>("write_caption_file", { imagePath, caption }),

  getImageThumbnail: (path: string, max?: number): Promise<string> =>
    invoke<string>("get_image_thumbnail", { path, max }),

  exportDataset: (
    outputDir: string,
    items: ExportItem[],
  ): Promise<number> => invoke<number>("export_dataset", { outputDir, items }),

  exportDatasetZip: (
    outputPath: string,
    items: ExportItem[],
  ): Promise<number> =>
    invoke<number>("export_dataset_zip", { outputPath, items }),

  dbQuery: <T = unknown>(sql: string, params: unknown[]): Promise<T[]> =>
    invoke<T[]>("db_query", { sql, params }),

  dbExecute: (sql: string, params: unknown[]): Promise<number> =>
    invoke<number>("db_execute", { sql, params }),

  startSidecar: (): Promise<number> => invoke<number>("start_sidecar"),

  stopSidecar: (): Promise<void> => invoke<void>("stop_sidecar"),

  getSidecarPort: (): Promise<number | null> =>
    invoke<number | null>("get_sidecar_port"),
};
