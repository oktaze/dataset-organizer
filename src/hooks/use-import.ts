import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { tauri, type ImageMeta } from "@/lib/tauri";
import { imagesDb } from "@/lib/db";
import type { Project } from "@/lib/types";

export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];

/**
 * Image import. Two entry points sharing the same de-dup → insert flow:
 * `run` scans a folder, `runFiles` takes hand-picked files (possibly from
 * several folders — call it again to add more). Both insert new images as
 * "pending"; tagging is **not** run here — the user launches it explicitly
 * from the "Tag images" dialog.
 */
export function useImport() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  const skippedMsg =
    skipped.length === 0
      ? null
      : `${skipped.length} file${skipped.length === 1 ? "" : "s"} skipped (unreadable / corrupt)`;

  /** De-dup against already-imported paths and insert the fresh ones. */
  async function addMetas(
    project: Project,
    metas: ImageMeta[],
    emptyMsg: string,
    allExistMsg: string,
  ) {
    const existing = await imagesDb.existingPaths(project.id);
    const fresh = metas.filter((m) => !existing.has(m.filepath));

    if (fresh.length === 0) {
      setError(metas.length === 0 ? emptyMsg : allExistMsg);
      return;
    }

    setProgress({ phase: "Copying images", done: 0, total: fresh.length });
    const failed: string[] = [];
    for (const m of fresh) {
      try {
        // Generate the id first so the managed library file is named after
        // the image row; copy the file in, then store the managed path.
        const id = crypto.randomUUID();
        const managed = await tauri.importIntoLibrary(
          project.id,
          id,
          m.filepath,
        );
        await imagesDb.insert({
          id,
          projectId: project.id,
          filename: m.filename,
          filepath: managed,
          sourcePath: m.filepath,
          width: m.width,
          height: m.height,
        });
      } catch {
        // Source vanished / unreadable between scan and copy — skip this
        // one, keep importing the rest.
        failed.push(m.filepath);
      }
      setProgress((p) => p && { ...p, done: p.done + 1 });
    }
    if (failed.length > 0) setSkipped((s) => [...s, ...failed]);
    qc.invalidateQueries({ queryKey: ["images", project.id] });
  }

  /** Folder import: scan every image in the chosen directory. */
  async function run(project: Project) {
    setError(null);
    setSkipped([]);
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;

    setRunning(true);
    try {
      setProgress({ phase: "Scanning folder", done: 0, total: 0 });
      const { images, skipped: skip } = await tauri.readImagesFromDir(dir);
      setSkipped(skip);
      await addMetas(
        project,
        images,
        "No images found in that folder.",
        "All images already imported.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  /** File import: hand-pick one or more images (re-run to add from other
   *  folders — the OS picker is usually limited to one folder per call). */
  async function runFiles(project: Project) {
    setError(null);
    setSkipped([]);
    const sel = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: IMAGE_EXTS }],
    });
    if (!Array.isArray(sel) || sel.length === 0) return;

    setRunning(true);
    try {
      setProgress({ phase: "Reading files", done: 0, total: 0 });
      const { images, skipped: skip } = await tauri.readImagesMeta(sel);
      setSkipped(skip);
      await addMetas(
        project,
        images,
        "No valid images selected.",
        "All selected images already imported.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return { run, runFiles, running, progress, error, skipped, skippedMsg };
}
