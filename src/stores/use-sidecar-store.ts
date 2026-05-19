import { create } from "zustand";

export type SidecarStatus = "starting" | "ready" | "offline";

interface SidecarState {
  port: number | null;
  status: SidecarStatus;
  modelLoaded: boolean;
  /** Auto-restart attempt in progress (0 = none), for the status bar. */
  restartAttempt: number;
  setPort: (port: number | null) => void;
  setStatus: (status: SidecarStatus) => void;
  setModelLoaded: (modelLoaded: boolean) => void;
  setRestartAttempt: (restartAttempt: number) => void;
}

/** Holds the sidecar port so non-React modules (`lib/sidecar.ts`) can
 *  reach it via `useSidecarStore.getState()`. */
export const useSidecarStore = create<SidecarState>((set) => ({
  port: null,
  status: "starting",
  modelLoaded: false,
  restartAttempt: 0,
  setPort: (port) => set({ port }),
  setStatus: (status) => set({ status }),
  setModelLoaded: (modelLoaded) => set({ modelLoaded }),
  setRestartAttempt: (restartAttempt) => set({ restartAttempt }),
}));
