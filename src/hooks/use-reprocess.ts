import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sidecar } from "@/lib/sidecar";
import { imagesDb } from "@/lib/db";
import { makePipelineCtx, processImage } from "@/lib/pipeline";
import type { ImageItem, Project } from "@/lib/types";

export interface ReprocessProgress {
  phase: string;
  done: number;
  total: number;
}

/**
 * Re-run the full pipeline (WD Tagger -> costume match -> caption) on
 * already-imported images, e.g. after editing costumes, constant tags
 * or the WD threshold. Overwrites auto tags & captions.
 */
export function useReprocess() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ReprocessProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(project: Project, images: ImageItem[]) {
    setError(null);
    setResult(null);
    if (images.length === 0) {
      setError("No images to reprocess.");
      return;
    }

    setRunning(true);
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ["images", project.id] });

    try {
      const ctx = await makePipelineCtx(project);
      const health = await sidecar.health().catch(() => null);
      const modelPreloaded = health?.model_loaded === true;
      setProgress({
        phase: modelPreloaded
          ? "Re-tagging & captioning"
          : "Loading WD Tagger model (first run, ~400 MB)",
        done: 0,
        total: images.length,
      });

      let failed = 0;
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const patch = await processImage(img, ctx);
          if (i === 0 && !modelPreloaded) {
            setProgress((p) => p && { ...p, phase: "Re-tagging & captioning" });
          }
          await imagesDb.update(img.id, patch);
        } catch (e) {
          failed++;
          console.error(`reprocess failed for ${img.filename}:`, e);
        }
        setProgress((p) => p && { ...p, done: p.done + 1 });
        if ((i + 1) % 8 === 0) invalidate();
      }

      invalidate();
      const ok = images.length - failed;
      setResult(
        `Reprocessed ${ok} image${ok === 1 ? "" : "s"}${
          failed ? `, ${failed} failed (see console)` : ""
        }.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return { run, running, progress, error, result };
}
