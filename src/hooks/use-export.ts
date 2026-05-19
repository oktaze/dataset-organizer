import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { tauri, type ExportItem } from "@/lib/tauri";
import { imagesDb, costumesDb } from "@/lib/db";
import type { ImageItem, Project } from "@/lib/types";

export type ExportScope = "validated" | "tagged" | "all";
export type ExportFormat = "folder" | "zip";

export interface ExportOptions {
  scope: ExportScope;
  groupByCostume: boolean;
  format: ExportFormat;
}

export function selectImages(
  images: ImageItem[],
  scope: ExportScope,
): ImageItem[] {
  if (scope === "all") return images;
  if (scope === "validated")
    return images.filter((i) => i.status === "validated");
  return images.filter((i) => i.status !== "pending");
}

export function captionFor(img: ImageItem, project: Project): string {
  const c = img.caption?.trim();
  if (c) return c;
  if (img.tagsFinal.length > 0) return img.tagsFinal.join(", ");
  return project.trigger;
}

/** Select images by scope, resolve the per-costume sub-folder, and build
 *  the `ExportItem[]`. Shared by folder/zip export and HuggingFace upload
 *  so caption + grouping logic stays in one place. */
export async function buildExportItems(
  project: Project,
  images: ImageItem[],
  opts: { scope: ExportScope; groupByCostume: boolean },
): Promise<{ chosen: ImageItem[]; items: ExportItem[] }> {
  const chosen = selectImages(images, opts.scope);

  let costumeName: (id: string | null) => string | undefined = () =>
    undefined;
  if (opts.groupByCostume && project.type === "character") {
    const costumes = await costumesDb.list(project.id);
    const byId = new Map(costumes.map((c) => [c.id, c.name]));
    costumeName = (id) =>
      id ? (byId.get(id) ?? "_unassigned") : "_unassigned";
  }

  const items: ExportItem[] = chosen.map((img) => ({
    source_path: img.filepath,
    target_name: img.filename,
    caption: captionFor(img, project),
    subdir: costumeName(img.costumeId),
  }));

  return { chosen, items };
}

export function useExport() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    project: Project,
    images: ImageItem[],
    opts: ExportOptions,
  ) {
    setError(null);
    setResult(null);

    if (selectImages(images, opts.scope).length === 0) {
      setError("No images match this selection.");
      return;
    }

    const safeName = project.name.replace(/[^a-z0-9_-]+/gi, "_");
    const dest =
      opts.format === "zip"
        ? await save({
            defaultPath: `${safeName}.zip`,
            filters: [{ name: "Zip archive", extensions: ["zip"] }],
          })
        : await open({ directory: true, multiple: false });
    if (typeof dest !== "string") return;

    setRunning(true);
    try {
      const { chosen, items } = await buildExportItems(project, images, opts);

      const count =
        opts.format === "zip"
          ? await tauri.exportDatasetZip(dest, items)
          : await tauri.exportDataset(dest, items);
      await imagesDb.markExported(chosen.map((i) => i.id));
      qc.invalidateQueries({ queryKey: ["images", project.id] });
      setResult(
        `Exported ${count} image${count === 1 ? "" : "s"} to ${dest}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return { run, running, result, error };
}
