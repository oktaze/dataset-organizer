import { create } from "zustand";

export type SidecarStatus = "starting" | "ready" | "offline";

interface SidecarState {
  port: number | null;
  status: SidecarStatus;
  modelLoaded: boolean;
  setPort: (port: number | null) => void;
  setStatus: (status: SidecarStatus) => void;
  setModelLoaded: (modelLoaded: boolean) => void;
}

/** Holds the sidecar port so non-React modules (`lib/sidecar.ts`) can
 *  reach it via `useSidecarStore.getState()`. */
export const useSidecarStore = create<SidecarState>((set) => ({
  port: null,
  status: "starting",
  modelLoaded: false,
  setPort: (port) => set({ port }),
  setStatus: (status) => set({ status }),
  setModelLoaded: (modelLoaded) => set({ modelLoaded }),
}));
