import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw } from "lucide-react";
import { useImages } from "@/hooks/use-images";
import { useReprocess } from "@/hooks/use-reprocess";
import {
  useSettingsStore,
  DEFAULT_THRESHOLD,
} from "@/stores/use-settings-store";
import type { Project } from "@/lib/types";

interface ReprocessDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReprocessDialog({
  project,
  open,
  onOpenChange,
}: ReprocessDialogProps) {
  const { data: images = [] } = useImages(project.id);
  const { run, running, progress, error, result } = useReprocess();

  const threshold = useSettingsStore(
    (s) => s.thresholds[project.id] ?? DEFAULT_THRESHOLD,
  );
  const setThreshold = useSettingsStore((s) => s.setThreshold);
  const claudeVision = useSettingsStore(
    (s) => s.claudeVision[project.id] ?? false,
  );
  const setClaudeVision = useSettingsStore((s) => s.setClaudeVision);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprocess images</DialogTitle>
          <DialogDescription>
            Re-runs WD Tagger, costume matching and caption building on every
            image in <strong>{project.name}</strong>. Use this after editing
            costumes, constant tags, or the threshold below.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-threshold">
              WD Tagger threshold ({threshold.toFixed(2)}) · also used by import
            </Label>
            <Input
              id="rp-threshold"
              type="number"
              min={0.05}
              max={0.95}
              step={0.05}
              value={threshold}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v)) {
                  setThreshold(project.id, Math.min(0.95, Math.max(0.05, v)));
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Lower = more tags (noisier), higher = fewer (stricter). Default{" "}
              {DEFAULT_THRESHOLD}.
            </p>
          </div>

          {project.type === "character" && (
            <label className="flex items-start gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={claudeVision}
                onChange={(e) =>
                  setClaudeVision(project.id, e.target.checked)
                }
                className="mt-0.5 size-3.5 accent-primary"
              />
              <span>
                Use Claude Vision for costume matching
                <span className="block text-[11px] text-muted-foreground">
                  More accurate on ambiguous outfits. Set your API key & model
                  in <strong>Settings</strong> (gear, top-left) — falls back to
                  WD Tagger if unset. Also applies to imports.
                </span>
              </span>
            </label>
          )}

          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-400">
            Overwrites auto tags & captions for all {images.length} image
            {images.length === 1 ? "" : "s"} — manual tag/caption edits and
            validation status are reset.
          </p>

          {progress && (
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{progress.phase}</span>
                <span>
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: progress.total
                      ? `${(progress.done / progress.total) * 100}%`
                      : "30%",
                  }}
                />
              </div>
            </div>
          )}
          {result && (
            <p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-400">
              {result}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => void run(project, images)}
            disabled={running || images.length === 0}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Re-run pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
