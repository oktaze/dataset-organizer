import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { tauri } from "@/lib/tauri";
import { useSidecarStore, type SidecarStatus } from "@/stores/use-sidecar-store";

const MAX_RESTARTS = 3;
const RESTART_DELAYS_MS = [2000, 5000, 10000];
/** Failed `/health` polls (≈1s each) tolerated before acting. A booting
 *  sidecar (model load, cold start) gets a long grace; one that was ready
 *  and stopped answering is treated as a crash almost immediately. */
const BOOT_GRACE = 25;
const CRASH_GRACE = 3;

export type { SidecarStatus };

interface Health {
  status: string;
  model_loaded: boolean;
}

interface UseSidecarResult {
  port: number | null;
  status: SidecarStatus;
  modelLoaded: boolean;
}

/**
 * Bootstraps the auto-started sidecar (event + pull fallback for the
 * mount race), polls `/health`, and mirrors port/status/modelLoaded into
 * `useSidecarStore`. Call once near the app root.
 */
export function useSidecar(): UseSidecarResult {
  const {
    port,
    status,
    modelLoaded,
    setPort,
    setStatus,
    setModelLoaded,
    setRestartAttempt,
  } = useSidecarStore();

  const everReady = useRef(false);
  const failures = useRef(0);
  const restartAttempts = useRef(0);
  const restarting = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<number>("sidecar://ready", (event) => {
        setPort(event.payload);
      });
      try {
        const existing = await tauri.getSidecarPort();
        if (cancelled) return;
        setPort(existing ?? (await tauri.startSidecar()));
      } catch {
        setStatus("offline");
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [setPort, setStatus]);

  const health = useQuery<Health>({
    queryKey: ["sidecar-health", port],
    enabled: port != null,
    // No internal retry: each refetchInterval tick is one poll, so the
    // watchdog below counts failed seconds predictably.
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "ok" ? 15000 : 1000,
    queryFn: async (): Promise<Health> => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (!res.ok) throw new Error(`health ${res.status}`);
      return (await res.json()) as Health;
    },
  });

  useEffect(() => {
    if (health.data?.status === "ok") {
      everReady.current = true;
      failures.current = 0;
      restartAttempts.current = 0;
      setRestartAttempt(0);
      setStatus("ready");
      setModelLoaded(health.data.model_loaded);
      return;
    }
    if (port == null || !health.isError || restarting.current) return;

    failures.current += 1;
    const grace = everReady.current ? CRASH_GRACE : BOOT_GRACE;
    if (failures.current < grace) return;

    if (restartAttempts.current >= MAX_RESTARTS) {
      setStatus("offline");
      return;
    }

    // The sidecar is down — respawn it (Rust `start_sidecar` is idempotent:
    // it reaps a dead child and returns a fresh port) with backoff.
    restarting.current = true;
    const attempt = restartAttempts.current;
    restartAttempts.current = attempt + 1;
    setRestartAttempt(attempt + 1);
    setStatus("starting");
    const delay =
      RESTART_DELAYS_MS[Math.min(attempt, RESTART_DELAYS_MS.length - 1)];
    const timer = setTimeout(() => {
      void tauri
        .startSidecar()
        .then((p) => {
          failures.current = 0;
          // Re-keys the health query onto the new port.
          setPort(p);
        })
        .catch(() => setStatus("offline"))
        .finally(() => {
          restarting.current = false;
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [
    health.data,
    health.isError,
    health.errorUpdatedAt,
    port,
    setPort,
    setStatus,
    setModelLoaded,
    setRestartAttempt,
  ]);

  return { port, status, modelLoaded };
}
