import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { tauri } from "@/lib/tauri";
import { imagesDb } from "@/lib/db";
import type { Project } from "@/lib/types";

export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
}

/**
 * Folder import: scans the folder, de-dups against already-imported
 * paths and inserts new images as "pending". Tagging is **not** run
 * here — the user launches it explicitly from the "Tag images" dialog.
 */
export function useImport() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(project: Project) {
    setError(null);
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;

    setRunning(true);
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ["images", project.id] });

    try {
      setProgress({ phase: "Scanning folder", done: 0, total: 0 });
      const metas = await tauri.readImagesFromDir(dir);
      const existing = await imagesDb.existingPaths(project.id);
      const fresh = metas.filter((m) => !existing.has(m.filepath));

      if (fresh.length === 0) {
        setError(
          metas.length === 0
            ? "No images found in that folder."
            : "All images already imported.",
        );
        return;
      }

      setProgress({ phase: "Adding images", done: 0, total: fresh.length });
      for (const m of fresh) {
        await imagesDb.insert({
          projectId: project.id,
          filename: m.filename,
          filepath: m.filepath,
          width: m.width,
          height: m.height,
        });
        setProgress((p) => p && { ...p, done: p.done + 1 });
      }
      invalidate();
      // Tagging is no longer automatic — the user runs it from the
      // "Tag images" dialog (see useReprocess).
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return { run, running, progress, error };
}
