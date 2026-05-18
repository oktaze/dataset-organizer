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
 * Run the full pipeline (WD Tagger -> costume match -> caption) on
 * imported images. This is the single tagging entry point (initial
 * tagging after import *and* re-tagging). The existing-tags policy
 * (ignore / append / overwrite) decides what happens to images that
 * already have tags.
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
          ? "Tagging & captioning"
          : "Loading WD Tagger model (first run, ~400 MB)",
        done: 0,
        total: images.length,
      });

      let failed = 0;
      let skipped = 0;
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const patch = await processImage(img, ctx);
          if (i === 0 && !modelPreloaded) {
            setProgress((p) => p && { ...p, phase: "Tagging & captioning" });
          }
          // Empty patch = skipped under the "ignore" policy.
          if (Object.keys(patch).length === 0) {
            skipped++;
          } else {
            await imagesDb.update(img.id, patch);
          }
        } catch (e) {
          failed++;
          console.error(`tagging failed for ${img.filename}:`, e);
        }
        setProgress((p) => p && { ...p, done: p.done + 1 });
        if ((i + 1) % 8 === 0) invalidate();
      }

      invalidate();
      const tagged = images.length - failed - skipped;
      setResult(
        `Tagged ${tagged} image${tagged === 1 ? "" : "s"}` +
          (skipped ? `, ${skipped} skipped (already tagged)` : "") +
          (failed ? `, ${failed} failed (see console)` : "") +
          ".",
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
