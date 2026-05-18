/** HTTP client for the Python sidecar. Reads the port from the sidecar
 *  store so it works outside React (mutations, import pipeline). */

import { useSidecarStore } from "@/stores/use-sidecar-store";
import type { TagScore } from "@/lib/types";

function baseUrl(): string {
  const port = useSidecarStore.getState().port;
  if (port == null) throw new Error("Sidecar is not ready yet");
  return `http://127.0.0.1:${port}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface SidecarHealth {
  status: string;
  model_loaded: boolean;
}

export interface ModelStatus {
  state: "idle" | "downloading" | "done" | "error";
  downloaded: number;
  total: number;
  downloaded_ok: boolean;
  model_loaded: boolean;
  error: string | null;
}

export interface TagBatchResult {
  path: string;
  tags: TagScore[];
}

export interface CostumeMatchInput {
  id: string;
  name?: string;
  tags: string[];
  color_tags: string[];
}

export interface CostumeMatchResult {
  best_costume_id: string | null;
  scores: Record<string, number>;
  method: string;
}

export interface CaptionBuildInput {
  trigger: string;
  auto_tags: string[];
  constant_tags: string[];
  costume_tags?: string[];
  costume_trigger?: string;
}

export const sidecar = {
  health: async (): Promise<SidecarHealth> => {
    const res = await fetch(`${baseUrl()}/health`);
    if (!res.ok) throw new Error(`health ${res.status}`);
    return (await res.json()) as SidecarHealth;
  },

  modelStatus: async (): Promise<ModelStatus> => {
    const res = await fetch(`${baseUrl()}/model/status`);
    if (!res.ok) throw new Error(`model/status ${res.status}`);
    return (await res.json()) as ModelStatus;
  },

  startModelDownload: () =>
    post<ModelStatus>("/model/download", {}),

  tagOne: (imagePath: string, threshold?: number) =>
    post<{ tags: TagScore[] }>("/tag", {
      image_path: imagePath,
      threshold,
    }),

  tagBatch: (imagePaths: string[], threshold?: number) =>
    post<{ results: TagBatchResult[] }>("/tag/batch", {
      image_paths: imagePaths,
      threshold,
    }),

  matchCostume: (
    imagePath: string,
    costumes: CostumeMatchInput[],
    threshold?: number,
    useClaude = false,
    apiKey?: string,
    model?: string,
  ) =>
    post<CostumeMatchResult>("/costume/match", {
      image_path: imagePath,
      costumes,
      threshold,
      use_claude: useClaude,
      api_key: apiKey || undefined,
      model: model || undefined,
    }),

  buildCaption: (input: CaptionBuildInput) =>
    post<{ caption: string }>("/caption/build", input),
};
