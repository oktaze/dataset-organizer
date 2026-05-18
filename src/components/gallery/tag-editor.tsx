import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Check, RefreshCw, X, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useImages, useUpdateImage } from "@/hooks/use-images";
import { useCostumes } from "@/hooks/use-costumes";
import { useConstantTags } from "@/hooks/use-constant-tags";
import { useUiStore } from "@/stores/use-ui-store";
import { sidecar } from "@/lib/sidecar";
import { makePipelineCtx, processImage } from "@/lib/pipeline";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

function scoreClass(score: number | undefined): string {
  if (score === undefined) return "bg-secondary text-secondary-foreground";
  if (score >= 0.85) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 0.5) return "bg-amber-500/20 text-amber-400";
  return "bg-muted text-muted-foreground";
}

interface TagEditorProps {
  project: Project;
}

export function TagEditor({ project }: TagEditorProps) {
  const { data: images = [] } = useImages(project.id);
  const { data: costumes = [] } = useCostumes(project.id);
  const { data: constants = [] } = useConstantTags(project.id);
  const update = useUpdateImage(project.id);

  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const image = images.find((i) => i.id === selectedImageId) ?? null;

  const [caption, setCaption] = useState("");
  const [draftTag, setDraftTag] = useState("");
  const [retagging, setRetagging] = useState(false);
  useEffect(() => {
    setCaption(image?.caption ?? "");
    setDraftTag("");
  }, [image?.id, image?.caption]);

  const scoreOf = useMemo(() => {
    const m = new Map(image?.tagsAuto.map((t) => [t.tag, t.score]) ?? []);
    return (tag: string) => m.get(tag);
  }, [image?.tagsAuto]);

  if (!image) {
    return (
      <aside className="flex h-full flex-col items-center justify-center border-l border-border bg-card p-6">
        <p className="text-center text-xs text-muted-foreground">
          Select an image to edit its tags
        </p>
      </aside>
    );
  }

  const tags = image.tagsFinal;

  function patch(p: Parameters<typeof update.mutate>[0]["patch"]) {
    if (image) update.mutate({ id: image.id, patch: p });
  }

  function setTags(next: string[]) {
    patch({ tagsFinal: next });
  }

  function addTag() {
    const t = draftTag.trim().replace(/,$/, "").trim();
    setDraftTag("");
    if (t === "" || tags.includes(t)) return;
    setTags([...tags, t]);
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  async function rebuildCaption() {
    if (!image) return;
    const costume = costumes.find((c) => c.id === image.costumeId) ?? null;
    const costumeTags = costume
      ? [...costume.tags, ...costume.colorTags]
      : undefined;
    const { caption: next } = await sidecar.buildCaption({
      trigger: project.trigger,
      auto_tags: tags,
      constant_tags: constants.map((c) => c.tag),
      costume_tags: costumeTags && costumeTags.length > 0 ? costumeTags : undefined,
      costume_trigger: costume?.trigger ?? undefined,
    });
    setCaption(next);
    patch({ caption: next });
  }

  async function retagImage() {
    if (!image || retagging) return;
    setRetagging(true);
    try {
      const ctx = await makePipelineCtx(project);
      const next = await processImage(image, ctx);
      await update.mutateAsync({ id: image.id, patch: next });
      setCaption(next.caption ?? "");
    } catch (e) {
      console.error("re-tag failed:", e);
    } finally {
      setRetagging(false);
    }
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-border bg-card">
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-card-foreground">
            {image.filename}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {image.width ?? "?"}×{image.height ?? "?"} · {image.status}
          </p>
        </div>
        <Button
          size="xs"
          variant="outline"
          onClick={() => void retagImage()}
          disabled={retagging}
          title="Re-run WD Tagger, costume match & caption for this image"
        >
          <Wand2
            className={cn("size-3", retagging && "animate-spin")}
          />
          Re-tag
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {project.type === "character" && (
          <div className="flex flex-col gap-1.5">
            <Label>Costume</Label>
            <Select
              value={image.costumeId ?? ""}
              onChange={(e) =>
                patch({ costumeId: e.target.value === "" ? null : e.target.value })
              }
            >
              <option value="">— none —</option>
              {costumes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Tags · confidence colored</Label>
          <div className="flex flex-wrap gap-1 rounded-lg border border-input bg-input/30 p-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                  scoreClass(scoreOf(t)),
                )}
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  aria-label={`Remove ${t}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={draftTag}
              onChange={(e) => setDraftTag(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={addTag}
              placeholder={tags.length === 0 ? "Add tag…" : ""}
              className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Caption</Label>
            <button
              type="button"
              onClick={() => void rebuildCaption()}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <RefreshCw className="size-3" />
              Rebuild from tags
            </button>
          </div>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => caption !== image.caption && patch({ caption })}
            className="min-h-28 font-mono text-xs leading-relaxed"
          />
        </div>

        {project.type === "character" &&
          Object.keys(image.costumeScore).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Costume match scores</Label>
              <div className="flex flex-wrap gap-1">
                {costumes
                  .filter((c) => c.id in image.costumeScore)
                  .map((c) => (
                    <Badge key={c.id} variant="outline">
                      {c.name} {(image.costumeScore[c.id] * 100).toFixed(0)}%
                    </Badge>
                  ))}
              </div>
            </div>
          )}
      </div>

      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          variant={image.status === "validated" ? "secondary" : "default"}
          onClick={() =>
            patch({
              status:
                image.status === "validated" ? "tagged" : "validated",
            })
          }
        >
          <Check className="size-3.5" />
          {image.status === "validated" ? "Validated — undo" : "Validate (V)"}
        </Button>
      </div>
    </aside>
  );
}
