import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { tauri } from "@/lib/tauri";
import { useSidecarStore, type SidecarStatus } from "@/stores/use-sidecar-store";

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
  const { port, status, modelLoaded, setPort, setStatus, setModelLoaded } =
    useSidecarStore();

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
    retry: true,
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
      setStatus("ready");
      setModelLoaded(health.data.model_loaded);
    } else if (port != null && health.isError) {
      setStatus("offline");
    }
  }, [health.data, health.isError, port, setStatus, setModelLoaded]);

  return { port, status, modelLoaded };
}
