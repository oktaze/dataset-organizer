import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tauri } from "@/lib/tauri";
import { sidecar } from "@/lib/sidecar";
import { imagesDb } from "@/lib/db";
import { getToken } from "@/lib/hf-token-store";
import { buildExportItems, type ExportScope } from "@/hooks/use-export";
import type { ImageItem, Project } from "@/lib/types";

export interface HfUploadOptions {
  scope: ExportScope;
  groupByCostume: boolean;
  /** "username/dataset-name". */
  repoId: string;
  private: boolean;
  /** Also write README.md dataset card + metadata.jsonl. */
  metadata: boolean;
}

interface Progress {
  phase: string;
  done: number;
  total: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useHuggingfaceUpload() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    project: Project,
    images: ImageItem[],
    opts: HfUploadOptions,
  ) {
    setError(null);
    setResult(null);
    setProgress(null);

    const token = await getToken();
    if (!token) {
      setError("Connect a HuggingFace token in Settings first.");
      return;
    }

    const { chosen, items } = await buildExportItems(project, images, opts);
    if (chosen.length === 0) {
      setError("No images match this selection.");
      return;
    }

    setRunning(true);
    let tmp: string | null = null;
    try {
      setProgress({ phase: "Preparing dataset", done: 0, total: 0 });
      tmp = await tauri.hfExportTmpdir();
      await tauri.exportDataset(
        tmp,
        items,
        opts.metadata
          ? {
              project_name: project.name,
              description: `Training dataset for the "${project.trigger}" ${project.type} LoRA.`,
            }
          : undefined,
      );

      await sidecar.startHfUpload(
        tmp,
        opts.repoId,
        token,
        opts.private,
      );

      // huggingface_hub gives no per-byte callback for upload_folder, so
      // poll the phase-based state machine (indeterminate bar in the UI).
      for (;;) {
        const st = await sidecar.hfUploadStatus();
        setProgress({
          phase: st.phase || "Uploading",
          done: st.done,
          total: st.total,
        });
        if (st.state === "done") {
          setResult(st.repo_url ?? `https://huggingface.co/datasets/${opts.repoId}`);
          break;
        }
        if (st.state === "error") {
          throw new Error(st.error ?? "Upload failed");
        }
        await sleep(1200);
      }

      await imagesDb.markExported(chosen.map((i) => i.id));
      qc.invalidateQueries({ queryKey: ["images", project.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (tmp) await tauri.removeDir(tmp).catch(() => {});
      setProgress(null);
      setRunning(false);
    }
  }

  return { run, running, progress, result, error };
}
