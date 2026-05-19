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

export interface HfUploadStatus {
  state: "idle" | "uploading" | "done" | "error";
  phase: string;
  done: number;
  total: number;
  repo_url: string | null;
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
  prepend_tags?: string[];
  append_tags?: string[];
}

export interface TagOptions {
  threshold?: number;
  maxTags?: number;
  blacklist?: string[];
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

  tagOne: (imagePath: string, opts?: TagOptions) =>
    post<{ tags: TagScore[] }>("/tag", {
      image_path: imagePath,
      threshold: opts?.threshold,
      max_tags: opts?.maxTags,
      blacklist: opts?.blacklist,
    }),

  tagBatch: (imagePaths: string[], opts?: TagOptions) =>
    post<{ results: TagBatchResult[] }>("/tag/batch", {
      image_paths: imagePaths,
      threshold: opts?.threshold,
      max_tags: opts?.maxTags,
      blacklist: opts?.blacklist,
    }),

  matchCostume: (
    imagePath: string,
    costumes: CostumeMatchInput[],
    threshold?: number,
  ) =>
    post<CostumeMatchResult>("/costume/match", {
      image_path: imagePath,
      costumes,
      threshold,
    }),

  buildCaption: (input: CaptionBuildInput) =>
    post<{ caption: string }>("/caption/build", input),

  validateHfToken: (token: string) =>
    post<{ username: string }>("/hf/validate", { token }),

  startHfUpload: (
    folder: string,
    repoId: string,
    token: string,
    isPrivate: boolean,
  ) =>
    post<HfUploadStatus>("/hf/upload", {
      folder,
      repo_id: repoId,
      token,
      private: isPrivate,
    }),

  hfUploadStatus: async (): Promise<HfUploadStatus> => {
    const res = await fetch(`${baseUrl()}/hf/upload/status`);
    if (!res.ok) throw new Error(`hf/upload/status ${res.status}`);
    return (await res.json()) as HfUploadStatus;
  },
};
