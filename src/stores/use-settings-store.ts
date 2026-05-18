import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_THRESHOLD = 0.35;
export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-7";

export const CLAUDE_MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7 — best, priciest (~$0.009/img)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced (~$0.005/img)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — cheapest (~$0.002/img)" },
] as const;

interface SettingsState {
  /** WD Tagger confidence threshold, per project id. */
  thresholds: Record<string, number>;
  /** Use Claude Vision for costume matching, per project id. */
  claudeVision: Record<string, boolean>;
  /** App-wide Anthropic API key (stored locally, plaintext). */
  anthropicApiKey: string;
  /** App-wide Claude Vision model id. */
  claudeModel: string;
  /** First-launch WD model download prompt already shown. */
  modelPromptSeen: boolean;
  setThreshold: (projectId: string, value: number) => void;
  setClaudeVision: (projectId: string, value: boolean) => void;
  setAnthropicApiKey: (key: string) => void;
  setClaudeModel: (model: string) => void;
  setModelPromptSeen: (seen: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      thresholds: {},
      claudeVision: {},
      anthropicApiKey: "",
      claudeModel: DEFAULT_CLAUDE_MODEL,
      modelPromptSeen: false,
      setThreshold: (projectId, value) =>
        set((s) => ({
          thresholds: { ...s.thresholds, [projectId]: value },
        })),
      setClaudeVision: (projectId, value) =>
        set((s) => ({
          claudeVision: { ...s.claudeVision, [projectId]: value },
        })),
      setAnthropicApiKey: (anthropicApiKey) => set({ anthropicApiKey }),
      setClaudeModel: (claudeModel) => set({ claudeModel }),
      setModelPromptSeen: (modelPromptSeen) => set({ modelPromptSeen }),
    }),
    { name: "lora-organizer-settings" },
  ),
);

/** Non-React accessors for the pipeline / hooks. */
export function getThreshold(projectId: string): number {
  return useSettingsStore.getState().thresholds[projectId] ?? DEFAULT_THRESHOLD;
}

export function getClaudeVision(projectId: string): boolean {
  return useSettingsStore.getState().claudeVision[projectId] ?? false;
}

export function getAnthropicApiKey(): string {
  return useSettingsStore.getState().anthropicApiKey.trim();
}

export function getClaudeModel(): string {
  return useSettingsStore.getState().claudeModel || DEFAULT_CLAUDE_MODEL;
}
