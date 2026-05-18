import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { sidecar, type ModelStatus } from "@/lib/sidecar";
import { useSidecarStore } from "@/stores/use-sidecar-store";

interface UseModelDownloadResult {
  ready: boolean;
  state: ModelStatus["state"];
  isDownloading: boolean;
  downloadedOk: boolean;
  downloaded: number;
  total: number;
  /** 0–100, or null when total is unknown (offline metadata). */
  percent: number | null;
  /** Seconds remaining, or null when not computable. */
  etaSeconds: number | null;
  error: string | null;
  start: () => void;
}

export function useModelDownload(): UseModelDownloadResult {
  const port = useSidecarStore((s) => s.port);
  const qc = useQueryClient();

  const query = useQuery<ModelStatus>({
    queryKey: ["model-status", port],
    enabled: port != null,
    queryFn: sidecar.modelStatus,
    refetchInterval: (q) =>
      q.state.data?.state === "downloading" ? 1000 : 8000,
  });

  const start = useMutation({
    mutationFn: () => sidecar.startModelDownload(),
    onSuccess: (s) => qc.setQueryData(["model-status", port], s),
  });

  const data = query.data;
  const sample = useRef<{ t: number; d: number; rate: number } | null>(null);
  const [etaSeconds, setEta] = useState<number | null>(null);

  useEffect(() => {
    if (!data || data.state !== "downloading") {
      sample.current = null;
      setEta(null);
      return;
    }
    const now = Date.now() / 1000;
    const prev = sample.current;
    if (prev && now > prev.t && data.downloaded >= prev.d) {
      const inst = (data.downloaded - prev.d) / (now - prev.t);
      const rate = prev.rate > 0 ? prev.rate * 0.6 + inst * 0.4 : inst;
      sample.current = { t: now, d: data.downloaded, rate };
      if (rate > 0 && data.total > 0) {
        setEta(Math.max(0, (data.total - data.downloaded) / rate));
      }
    } else {
      sample.current = { t: now, d: data.downloaded, rate: 0 };
    }
  }, [data]);

  const percent =
    data && data.total > 0
      ? Math.min(100, (data.downloaded / data.total) * 100)
      : null;

  return {
    ready: port != null && data != null,
    state: data?.state ?? "idle",
    isDownloading: data?.state === "downloading",
    downloadedOk: data?.downloaded_ok ?? false,
    downloaded: data?.downloaded ?? 0,
    total: data?.total ?? 0,
    percent,
    etaSeconds,
    error: data?.error ?? null,
    start: () => start.mutate(),
  };
}
