import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { tauri } from "@/lib/tauri";
import { sidecar } from "@/lib/sidecar";
import { imagesDb } from "@/lib/db";
import { makePipelineCtx, processImage } from "@/lib/pipeline";
import type { ImageItem, Project } from "@/lib/types";

export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
}

/**
 * Folder import pipeline (CLAUDE.md "Flux principal"), processed
 * **one image at a time** so progress is visible and the UI stays
 * responsive even while the WD model downloads on first run.
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
      const inserted: ImageItem[] = [];
      for (const m of fresh) {
        inserted.push(
          await imagesDb.insert({
            projectId: project.id,
            filename: m.filename,
            filepath: m.filepath,
            width: m.width,
            height: m.height,
          }),
        );
        setProgress((p) => p && { ...p, done: p.done + 1 });
      }
      invalidate();

      const ctx = await makePipelineCtx(project);

      // First /tag call lazily downloads the ~400 MB model — tell the user.
      const health = await sidecar.health().catch(() => null);
      const modelPreloaded = health?.model_loaded === true;
      setProgress({
        phase: modelPreloaded
          ? "Tagging & captioning"
          : "Loading WD Tagger model (first run, ~400 MB — this can take several minutes)",
        done: 0,
        total: fresh.length,
      });

      let failed = 0;
      for (let i = 0; i < inserted.length; i++) {
        const img = inserted[i];
        try {
          const patch = await processImage(img, ctx);
          if (i === 0 && !modelPreloaded) {
            setProgress((p) => p && { ...p, phase: "Tagging & captioning" });
          }
          await imagesDb.update(img.id, patch);
        } catch (e) {
          failed++;
          console.error(`tagging failed for ${img.filename}:`, e);
        }
        setProgress((p) => p && { ...p, done: p.done + 1 });
        if ((i + 1) % 8 === 0) invalidate();
      }

      invalidate();
      if (failed > 0) {
        setError(`${failed} image(s) could not be tagged (see console).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return { run, running, progress, error };
}
