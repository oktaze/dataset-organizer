import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useBulkImageActions } from "@/hooks/use-images";
import { useSettingsStore } from "@/stores/use-settings-store";
import type { Project } from "@/lib/types";

interface CurateButtonProps {
  project: Project;
  /** Ids of every image in the project (curate is project-wide). */
  imageIds: string[];
}

/** Header action: strip the global blacklist from every image of the project
 *  in one click, then rebuild captions. Confirms first, then shows the count
 *  removed. Undo is available via the gallery's undo bar. */
export function CurateButton({ project, imageIds }: CurateButtonProps) {
  const bulk = useBulkImageActions(project);
  const globalBlacklist = useSettingsStore((s) => s.globalBlacklist);
  const blacklist = globalBlacklist
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{
    imagesChanged: number;
    tagsRemoved: number;
  } | null>(null);

  const disabled = imageIds.length === 0 || blacklist.length === 0;
  const pending = bulk.curate.isPending;

  function openDialog() {
    setResult(null);
    setOpen(true);
  }

  function run() {
    bulk.curate.mutate(
      { ids: imageIds, blacklist },
      { onSuccess: (res) => setResult(res) },
    );
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={openDialog}
        disabled={disabled}
        title={
          blacklist.length === 0
            ? "Add blacklisted tags in Settings first"
            : undefined
        }
      >
        <Sparkles className="size-3.5" />
        Curate
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Curate tags</DialogTitle>
            <DialogDescription>
              {result
                ? "Blacklisted tags removed."
                : `Remove every blacklisted tag from all ${imageIds.length} image(s) in “${project.name}”, then rebuild their captions.`}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <p className="text-sm text-foreground">
              Removed <strong>{result.tagsRemoved}</strong> tag occurrence(s)
              across <strong>{result.imagesChanged}</strong> image(s). Use the
              Undo bar to revert.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {blacklist.map((t) => (
                <Badge key={t} variant="muted">
                  {t}
                </Badge>
              ))}
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button onClick={run} disabled={pending}>
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Curate
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
