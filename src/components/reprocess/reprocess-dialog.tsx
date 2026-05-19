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
import { Select } from "@/components/ui/select";
import { Loader2, Tags } from "lucide-react";
import { useImages } from "@/hooks/use-images";
import { useReprocess } from "@/hooks/use-reprocess";
import {
  useSettingsStore,
  DEFAULT_THRESHOLD,
  DEFAULT_MAX_TAGS,
  DEFAULT_EXISTING_POLICY,
  type ExistingPolicy,
} from "@/stores/use-settings-store";
import type { Project } from "@/lib/types";

interface ReprocessDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When set, only these image ids are processed (selection-scoped run).
   * Undefined = the whole project.
   */
  scopeIds?: string[];
}

export function ReprocessDialog({
  project,
  open,
  onOpenChange,
  scopeIds,
}: ReprocessDialogProps) {
  const { data: images = [] } = useImages(project.id);
  const { run, running, progress, error, result } = useReprocess();

  const scoped = scopeIds != null;
  const targetImages = scoped
    ? images.filter((img) => scopeIds.includes(img.id))
    : images;
  const targetCount = targetImages.length;

  const threshold = useSettingsStore(
    (s) => s.thresholds[project.id] ?? DEFAULT_THRESHOLD,
  );
  const setThreshold = useSettingsStore((s) => s.setThreshold);
  const maxTags = useSettingsStore(
    (s) => s.maxTags[project.id] ?? DEFAULT_MAX_TAGS,
  );
  const setMaxTags = useSettingsStore((s) => s.setMaxTags);
  const blacklist = useSettingsStore((s) => s.blacklist[project.id] ?? "");
  const setBlacklist = useSettingsStore((s) => s.setBlacklist);
  const prependTags = useSettingsStore((s) => s.prependTags[project.id] ?? "");
  const setPrependTags = useSettingsStore((s) => s.setPrependTags);
  const appendTags = useSettingsStore((s) => s.appendTags[project.id] ?? "");
  const setAppendTags = useSettingsStore((s) => s.setAppendTags);
  const existingPolicy = useSettingsStore(
    (s) => s.existingPolicy[project.id] ?? DEFAULT_EXISTING_POLICY,
  );
  const setExistingPolicy = useSettingsStore((s) => s.setExistingPolicy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {scoped ? "Tag selected images" : "Tag images"}
          </DialogTitle>
          <DialogDescription>
            Runs WD Tagger, costume matching and caption building on{" "}
            {scoped ? (
              <strong>
                {targetCount} selected image{targetCount === 1 ? "" : "s"}
              </strong>
            ) : (
              <>
                the images in <strong>{project.name}</strong>
              </>
            )}
            . Images that already have tags are handled per the policy
            below.
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-maxtags">Max tags</Label>
            <Input
              id="rp-maxtags"
              type="number"
              min={0}
              step={1}
              value={maxTags}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setMaxTags(project.id, Number.isNaN(v) ? 0 : Math.max(0, v));
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Keep only the N highest-confidence tags. 0 = no limit.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-blacklist">Blacklist</Label>
            <Input
              id="rp-blacklist"
              type="text"
              placeholder="1girl, solo, simple_background"
              value={blacklist}
              onChange={(e) => setBlacklist(project.id, e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Comma-separated, case-insensitive. Removed from tags & caption.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-prepend">Prepend tags</Label>
            <Input
              id="rp-prepend"
              type="text"
              placeholder="masterpiece, best quality"
              value={prependTags}
              onChange={(e) => setPrependTags(project.id, e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Comma-separated. Inserted just before the auto tags in every
              caption.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-append">Append tags</Label>
            <Input
              id="rp-append"
              type="text"
              placeholder="lowres, watermark"
              value={appendTags}
              onChange={(e) => setAppendTags(project.id, e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Comma-separated. Added at the very end of every caption.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-policy">If tags already exist</Label>
            <Select
              id="rp-policy"
              value={existingPolicy}
              onChange={(e) =>
                setExistingPolicy(
                  project.id,
                  e.target.value as ExistingPolicy,
                )
              }
            >
              <option value="ignore">
                Ignore — skip already-tagged images
              </option>
              <option value="append">
                Append — merge new tags into existing
              </option>
              <option value="overwrite">
                Overwrite — replace tags & caption
              </option>
            </Select>
          </div>

          {existingPolicy === "overwrite" ? (
            <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-400">
              Overwrites auto tags & captions for every already-tagged image
              among the {targetCount} targeted — manual tag/caption edits
              and validation status are reset.
            </p>
          ) : existingPolicy === "append" ? (
            <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
              Merges newly detected tags into already-tagged images; existing
              tags and manual edits are kept. Untagged images are tagged
              normally.
            </p>
          ) : (
            <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
              Only untagged images are processed — already-tagged images are
              left untouched.
            </p>
          )}

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
            onClick={() => void run(project, targetImages)}
            disabled={running || targetCount === 0}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Tags className="size-3.5" />
            )}
            {scoped ? `Tag ${targetCount} selected` : "Tag images"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
