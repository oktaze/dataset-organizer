import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdaterStore } from "@/stores/use-updater-store";
import { relaunchApp } from "@/hooks/use-app-updater";
import { cn } from "@/lib/utils";

/**
 * Non-intrusive bottom-right notification (VS Code style): a slim progress
 * line while the update downloads silently, then a "Restart to update"
 * card once it's ready. Dismissing keeps the update available in Settings.
 */
export function UpdateBanner() {
  const state = useUpdaterStore((s) => s.state);
  const newVersion = useUpdaterStore((s) => s.newVersion);
  const downloaded = useUpdaterStore((s) => s.downloaded);
  const contentLength = useUpdaterStore((s) => s.contentLength);
  const dismissed = useUpdaterStore((s) => s.dismissed);
  const dismiss = useUpdaterStore((s) => s.dismiss);

  if (state !== "downloading" && state !== "ready") return null;
  if (state === "ready" && dismissed) return null;

  const percent =
    contentLength > 0
      ? Math.min(100, (downloaded / contentLength) * 100)
      : null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
      {state === "downloading" ? (
        <>
          <div className="flex items-center justify-between text-xs text-foreground">
            <span>Downloading update…</span>
            <span className="text-muted-foreground">
              {percent != null ? `${percent.toFixed(0)}%` : ""}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
            <div
              className={cn(
                "h-full bg-primary transition-all",
                percent == null && "animate-pulse",
              )}
              style={{ width: `${percent ?? 40}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Update ready
              </p>
              <p className="text-xs text-muted-foreground">
                Version {newVersion} is installed. Restart to apply.
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={dismiss}>
              Later
            </Button>
            <Button size="sm" onClick={() => void relaunchApp()}>
              <RefreshCw className="size-3.5" />
              Restart now
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
