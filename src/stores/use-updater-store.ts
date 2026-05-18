import { create } from "zustand";

export type UpdateState =
  | "idle" // no check running / no update (see `upToDate` for "checked, none")
  | "checking"
  | "available" // update found, download not started yet
  | "downloading"
  | "ready" // downloaded + installed, awaiting relaunch
  | "error";

interface UpdaterState {
  state: UpdateState;
  /** Running app version, read once via `getVersion()`. */
  currentVersion: string | null;
  /** Version offered by the update, when one is available. */
  newVersion: string | null;
  /** Bytes downloaded so far during `downloading`. */
  downloaded: number;
  /** Total bytes (Content-Length) of the update artifact, 0 if unknown. */
  contentLength: number;
  /** Last check completed with no update available (manual-check feedback). */
  upToDate: boolean;
  /** User dismissed the "restart to update" banner via "Later". */
  dismissed: boolean;
  error: string | null;

  setState: (state: UpdateState) => void;
  setCurrentVersion: (v: string | null) => void;
  setNewVersion: (v: string | null) => void;
  setProgress: (downloaded: number, contentLength: number) => void;
  setUpToDate: (v: boolean) => void;
  setError: (e: string | null) => void;
  dismiss: () => void;
}

/** Shared across the startup banner (AppShell) and the manual check
 *  button (SettingsDialog) so both read one updater lifecycle. */
export const useUpdaterStore = create<UpdaterState>((set) => ({
  state: "idle",
  currentVersion: null,
  newVersion: null,
  downloaded: 0,
  contentLength: 0,
  upToDate: false,
  dismissed: false,
  error: null,

  setState: (state) => set({ state }),
  setCurrentVersion: (currentVersion) => set({ currentVersion }),
  setNewVersion: (newVersion) => set({ newVersion }),
  setProgress: (downloaded, contentLength) =>
    set({ downloaded, contentLength }),
  setUpToDate: (upToDate) => set({ upToDate }),
  setError: (error) => set({ error }),
  dismiss: () => set({ dismissed: true }),
}));
