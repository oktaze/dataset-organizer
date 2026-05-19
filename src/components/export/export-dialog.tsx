import { useMemo, useState } from "react";
import { Loader2, Download, UploadCloud, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import {
  useExport,
  selectImages,
  type ExportScope,
} from "@/hooks/use-export";
import { useHuggingfaceUpload } from "@/hooks/use-huggingface-upload";
import { useImages } from "@/hooks/use-images";
import { useSettingsStore } from "@/stores/use-settings-store";
import type { Project } from "@/lib/types";

type Destination = "folder" | "zip" | "huggingface";

interface ExportDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** HF repo names allow [a-zA-Z0-9._-]; collapse anything else to a dash. */
function sanitizeRepo(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "dataset"
  );
}

export function ExportDialog({
  project,
  open,
  onOpenChange,
}: ExportDialogProps) {
  const { data: images = [] } = useImages(project.id);
  const exporter = useExport();
  const hf = useHuggingfaceUpload();
  const hfUsername = useSettingsStore((s) => s.hfUsername);

  const [scope, setScope] = useState<ExportScope>("validated");
  const [dest, setDest] = useState<Destination>("folder");
  const [groupByCostume, setGroupByCostume] = useState(
    project.type === "character",
  );
  const [repoName, setRepoName] = useState(() =>
    sanitizeRepo(project.name),
  );
  const [hfPrivate, setHfPrivate] = useState(true);
  const [hfMeta, setHfMeta] = useState(true);

  const counts = useMemo(
    () => ({
      validated: selectImages(images, "validated").length,
      tagged: selectImages(images, "tagged").length,
      all: images.length,
    }),
    [images],
  );

  const isHf = dest === "huggingface";
  const running = isHf ? hf.running : exporter.running;
  const error = isHf ? hf.error : exporter.error;
  const result = isHf ? hf.result : exporter.result;
  const hfReady = hfUsername != null;

  function go() {
    if (dest === "huggingface") {
      void hf.run(project, images, {
        scope,
        groupByCostume,
        repoId: `${hfUsername}/${sanitizeRepo(repoName)}`,
        private: hfPrivate,
        metadata: hfMeta,
      });
      return;
    }
    void exporter.run(project, images, {
      scope,
      groupByCostume,
      format: dest,
    });
  }

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
            <Label htmlFor="exp-dest">Destination</Label>
            <Select
              id="exp-dest"
              value={dest}
              onChange={(e) => setDest(e.target.value as Destination)}
            >
              <option value="folder">Folder (local training)</option>
              <option value="zip">Zip archive (cloud upload)</option>
              <option value="huggingface">HuggingFace dataset</option>
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

          {isHf && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hf-repo">Repository</Label>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {hfUsername ?? "—"}/
                  </span>
                  <Input
                    id="hf-repo"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="dataset-name"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={hfPrivate}
                  onChange={(e) => setHfPrivate(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Private repository
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={hfMeta}
                  onChange={(e) => setHfMeta(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Generate dataset card &amp; metadata.jsonl
              </label>
              {!hfReady && (
                <p className="rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                  Connect a HuggingFace token in Settings to enable upload.
                </p>
              )}
            </>
          )}

          {isHf && hf.progress && (
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{hf.progress.phase}…</span>
                {hf.progress.total > 0 && (
                  <span>
                    {hf.progress.total} file
                    {hf.progress.total === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {/* huggingface_hub gives no per-file callback for
                  upload_folder — show an indeterminate bar, not a fake 0%. */}
              <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
                <div className="h-full w-1/3 animate-pulse rounded bg-primary" />
              </div>
            </div>
          )}

          {result &&
            (isHf ? (
              <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-400">
                <span className="min-w-0 truncate">
                  Uploaded to {result}
                </span>
                <button
                  type="button"
                  onClick={() => void openUrl(result)}
                  className="inline-flex shrink-0 items-center gap-1 underline"
                >
                  Open <ExternalLink className="size-3" />
                </button>
              </div>
            ) : (
              <p className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-400">
                {result}
              </p>
            ))}
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
            onClick={go}
            disabled={running || (isHf && !hfReady)}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isHf ? (
              <UploadCloud className="size-3.5" />
            ) : (
              <Download className="size-3.5" />
            )}
            {isHf
              ? "Upload to HuggingFace"
              : dest === "zip"
                ? "Choose .zip & export"
                : "Choose folder & export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
