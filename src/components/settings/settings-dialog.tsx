import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useSettingsStore, CLAUDE_MODELS } from "@/stores/use-settings-store";
import { useModelDownload } from "@/hooks/use-model-download";
import { formatBytes, formatDuration } from "@/lib/format";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const apiKey = useSettingsStore((s) => s.anthropicApiKey);
  const setApiKey = useSettingsStore((s) => s.setAnthropicApiKey);
  const model = useSettingsStore((s) => s.claudeModel);
  const setModel = useSettingsStore((s) => s.setClaudeModel);
  const wd = useModelDownload();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Claude Vision is an optional, paid fallback for costume matching.
            WD Tagger (local, free) is always the default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-key">Anthropic API key</Label>
            <Input
              id="set-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Stored locally on this machine in plaintext (like the rest of
              the app's data). Sent only to the local sidecar over loopback,
              only when Claude Vision is enabled for a project. Leave empty to
              fall back to <code>ANTHROPIC_API_KEY</code> in{" "}
              <code>sidecar/.env</code>.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-model">Claude Vision model</Label>
            <Select
              id="set-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Per-image cost estimate. Enable Claude Vision per project in the
              gallery's <strong>Reprocess</strong> dialog.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
