import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useModelDownload } from "@/hooks/use-model-download";
import { useUpdaterStore } from "@/stores/use-updater-store";
import { checkForUpdates, relaunchApp } from "@/hooks/use-app-updater";
import { formatBytes, formatDuration } from "@/lib/format";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const wd = useModelDownload();

  const updState = useUpdaterStore((s) => s.state);
  const currentVersion = useUpdaterStore((s) => s.currentVersion);
  const newVersion = useUpdaterStore((s) => s.newVersion);
  const updDownloaded = useUpdaterStore((s) => s.downloaded);
  const updTotal = useUpdaterStore((s) => s.contentLength);
  const upToDate = useUpdaterStore((s) => s.upToDate);
  const updError = useUpdaterStore((s) => s.error);
  const updBusy = updState === "checking" || updState === "downloading";
  const updPercent =
    updTotal > 0 ? Math.min(100, (updDownloaded / updTotal) * 100) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            App updates and the local WD Tagger model.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>App updates</Label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
              <div className="min-w-0 flex-1 text-xs">
                {updState === "ready" ? (
                  <span className="text-emerald-400">
                    Update {newVersion} ready — restart to apply
                  </span>
                ) : updState === "downloading" ? (
                  <span className="text-muted-foreground">
                    Downloading{" "}
                    {updPercent != null
                      ? `${updPercent.toFixed(0)}%`
                      : formatBytes(updDownloaded)}
                    …
                  </span>
                ) : updState === "checking" ? (
                  <span className="text-muted-foreground">
                    Checking for updates…
                  </span>
                ) : updState === "error" ? (
                  <span className="text-destructive">
                    {updError ?? "Update check failed"}
                  </span>
                ) : upToDate ? (
                  <span className="text-emerald-400">
                    Up to date ✓
                    {currentVersion ? ` (v${currentVersion})` : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {currentVersion
                      ? `Version ${currentVersion}`
                      : "Version unknown"}
                  </span>
                )}
              </div>
              {updState === "ready" ? (
                <Button size="sm" onClick={() => void relaunchApp()}>
                  <RefreshCw className="size-3.5" />
                  Restart
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={checkForUpdates}
                  disabled={updBusy}
                >
                  {updBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Check for updates
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>WD Tagger model (auto-tagging)</Label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
              <div className="min-w-0 flex-1 text-xs">
                {wd.downloadedOk ? (
                  <span className="text-emerald-400">Installed ✓</span>
                ) : wd.isDownloading ? (
                  <span className="text-muted-foreground">
                    Downloading…{" "}
                    {wd.percent != null
                      ? `${wd.percent.toFixed(0)}%`
                      : formatBytes(wd.downloaded)}
                    {wd.etaSeconds != null &&
                      ` · ETA ${formatDuration(wd.etaSeconds)}`}
                  </span>
                ) : wd.error ? (
                  <span className="text-destructive">{wd.error}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Not downloaded (~360 MB, one-time)
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={wd.start}
                disabled={
                  !wd.ready || wd.downloadedOk || wd.isDownloading
                }
              >
                {wd.isDownloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Download
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
