import { useMemo, useState } from "react";
import { Loader2, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  useExport,
  selectImages,
  type ExportScope,
  type ExportFormat,
} from "@/hooks/use-export";
import { useImages } from "@/hooks/use-images";
import type { Project } from "@/lib/types";

interface ExportDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDialog({
  project,
  open,
  onOpenChange,
}: ExportDialogProps) {
  const { data: images = [] } = useImages(project.id);
  const { run, running, result, error } = useExport();

  const [scope, setScope] = useState<ExportScope>("validated");
  const [format, setFormat] = useState<ExportFormat>("folder");
  const [groupByCostume, setGroupByCostume] = useState(
    project.type === "character",
  );

  const counts = useMemo(
    () => ({
      validated: selectImages(images, "validated").length,
      tagged: selectImages(images, "tagged").length,
      all: images.length,
    }),
    [images],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export dataset</DialogTitle>
          <DialogDescription>
            Copies images and writes a sibling <code>.txt</code> caption for
            each, ready for LoRA training.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-scope">Which images</Label>
            <Select
              id="exp-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as ExportScope)}
            >
              <option value="validated">
                Validated only ({counts.validated})
              </option>
              <option value="tagged">
                All tagged · excludes pending ({counts.tagged})
              </option>
              <option value="all">Everything ({counts.all})</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exp-format">Format</Label>
            <Select
              id="exp-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="folder">Folder (local training)</option>
              <option value="zip">Zip archive (cloud upload)</option>
            </Select>
          </div>

          {project.type === "character" && (
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={groupByCostume}
                onChange={(e) => setGroupByCostume(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Group into sub-folders by costume
            </label>
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
            onClick={() =>
              void run(project, images, { scope, groupByCostume, format })
            }
            disabled={running}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            {format === "zip"
              ? "Choose .zip & export"
              : "Choose folder & export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
