import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdaterStore } from "@/stores/use-updater-store";

/** Ensures the background startup check runs only once even if the hook
 *  mounts twice (StrictMode) or from multiple components. */
let bgCheckStarted = false;

/**
 * Run the full check → silent download → "ready" lifecycle, mirroring
 * progress into `useUpdaterStore`. `manual` distinguishes the user-driven
 * "Check for updates" button (surface errors, show "up to date") from the
 * background startup check (degrade quietly — e.g. `pnpm dev` web has no
 * Tauri context and `check()` throws).
 */
async function runUpdateFlow({ manual }: { manual: boolean }): Promise<void> {
  const s = useUpdaterStore.getState();
  // Don't restart a flow that's already mid-download / ready.
  if (s.state === "downloading" || s.state === "ready") return;

  s.setError(null);
  s.setUpToDate(false);
  s.setState("checking");
  try {
    const update = await check();
    if (!update) {
      s.setState("idle");
      s.setUpToDate(true);
      return;
    }
    s.setNewVersion(update.version);
    s.setState("available");

    let total = 0;
    let received = 0;
    await update.downloadAndInstall((ev) => {
      switch (ev.event) {
        case "Started":
          total = ev.data.contentLength ?? 0;
          useUpdaterStore.getState().setProgress(0, total);
          useUpdaterStore.getState().setState("downloading");
          break;
        case "Progress":
          received += ev.data.chunkLength;
          useUpdaterStore.getState().setProgress(received, total);
          break;
        case "Finished":
          useUpdaterStore.getState().setProgress(total, total);
          break;
      }
    });
    useUpdaterStore.getState().setState("ready");
  } catch (e) {
    if (manual) {
      s.setError(e instanceof Error ? e.message : String(e));
      s.setState("error");
    } else {
      // Offline / no Tauri context / transient: stay silent, no crash.
      s.setState("idle");
    }
  }
}

/** User-initiated check (Settings → "Check for updates"). */
export function checkForUpdates(): void {
  void runUpdateFlow({ manual: true });
}

/** Apply the downloaded update by relaunching the app. */
export async function relaunchApp(): Promise<void> {
  try {
    await relaunch();
  } catch (e) {
    const s = useUpdaterStore.getState();
    s.setError(e instanceof Error ? e.message : String(e));
    s.setState("error");
  }
}

/**
 * Mount once near the app root (AppShell). Reads the current version and
 * kicks off the VS Code-style background update check + silent download.
 */
export function useAppUpdater(): void {
  const setCurrentVersion = useUpdaterStore((s) => s.setCurrentVersion);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const v = await getVersion();
        if (!cancelled) setCurrentVersion(v);
      } catch {
        /* non-Tauri / dev — leave currentVersion null */
      }
    })();

    if (!bgCheckStarted) {
      bgCheckStarted = true;
      void runUpdateFlow({ manual: false });
    }

    return () => {
      cancelled = true;
    };
  }, [setCurrentVersion]);
}
