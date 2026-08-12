import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_THRESHOLD = 0.35;
/** Max number of auto tags kept per image. 0 = no limit. */
export const DEFAULT_MAX_TAGS = 0;

/** What to do when an image already has tags at tagging time. */
export type ExistingPolicy = "ignore" | "append" | "overwrite";
export const DEFAULT_EXISTING_POLICY: ExistingPolicy = "ignore";

interface SettingsState {
  /** WD Tagger confidence threshold, per project id. */
  thresholds: Record<string, number>;
  /** Max number of auto tags kept (0 = no limit), per project id. */
  maxTags: Record<string, number>;
  /** Excluded tags, raw comma-separated string, per project id. */
  blacklist: Record<string, string>;
  /** Tags forced before auto tags, raw comma-separated, per project id. */
  prependTags: Record<string, string>;
  /** Tags forced after auto tags, raw comma-separated, per project id. */
  appendTags: Record<string, string>;
  /** What to do when an image already has tags, per project id. */
  existingPolicy: Record<string, ExistingPolicy>;
  /** Tags stripped from images by the on-demand Curate action, raw
   *  comma-separated string. Global — shared by every project. */
  globalBlacklist: string;
  /** First-launch WD model download prompt already shown. */
  modelPromptSeen: boolean;
  /** HuggingFace username of the connected account (token is in
   *  hf-token-store, not here). Null when not connected. */
  hfUsername: string | null;
  setThreshold: (projectId: string, value: number) => void;
  setMaxTags: (projectId: string, value: number) => void;
  setBlacklist: (projectId: string, value: string) => void;
  setPrependTags: (projectId: string, value: string) => void;
  setAppendTags: (projectId: string, value: string) => void;
  setExistingPolicy: (projectId: string, value: ExistingPolicy) => void;
  setGlobalBlacklist: (value: string) => void;
  setModelPromptSeen: (seen: boolean) => void;
  setHfUsername: (name: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      thresholds: {},
      maxTags: {},
      blacklist: {},
      prependTags: {},
      appendTags: {},
      existingPolicy: {},
      globalBlacklist: "",
      modelPromptSeen: false,
      hfUsername: null,
      setThreshold: (projectId, value) =>
        set((s) => ({
          thresholds: { ...s.thresholds, [projectId]: value },
        })),
      setMaxTags: (projectId, value) =>
        set((s) => ({
          maxTags: { ...s.maxTags, [projectId]: value },
        })),
      setBlacklist: (projectId, value) =>
        set((s) => ({
          blacklist: { ...s.blacklist, [projectId]: value },
        })),
      setPrependTags: (projectId, value) =>
        set((s) => ({
          prependTags: { ...s.prependTags, [projectId]: value },
        })),
      setAppendTags: (projectId, value) =>
        set((s) => ({
          appendTags: { ...s.appendTags, [projectId]: value },
        })),
      setExistingPolicy: (projectId, value) =>
        set((s) => ({
          existingPolicy: { ...s.existingPolicy, [projectId]: value },
        })),
      setGlobalBlacklist: (globalBlacklist) => set({ globalBlacklist }),
      setModelPromptSeen: (modelPromptSeen) => set({ modelPromptSeen }),
      setHfUsername: (hfUsername) => set({ hfUsername }),
    }),
    { name: "dataset-organizer-settings" },
  ),
);

/** Non-React accessors for the pipeline / hooks. */
export function getThreshold(projectId: string): number {
  return useSettingsStore.getState().thresholds[projectId] ?? DEFAULT_THRESHOLD;
}

export function getMaxTags(projectId: string): number {
  return useSettingsStore.getState().maxTags[projectId] ?? DEFAULT_MAX_TAGS;
}

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getBlacklist(projectId: string): string[] {
  return parseCsv(useSettingsStore.getState().blacklist[projectId] ?? "");
}

export function getPrependTags(projectId: string): string[] {
  return parseCsv(useSettingsStore.getState().prependTags[projectId] ?? "");
}

export function getAppendTags(projectId: string): string[] {
  return parseCsv(useSettingsStore.getState().appendTags[projectId] ?? "");
}

export function getExistingPolicy(projectId: string): ExistingPolicy {
  return (
    useSettingsStore.getState().existingPolicy[projectId] ??
    DEFAULT_EXISTING_POLICY
  );
}

export function getGlobalBlacklist(): string[] {
  return parseCsv(useSettingsStore.getState().globalBlacklist);
}

export function getHfUsername(): string | null {
  return useSettingsStore.getState().hfUsername;
}
