import { useEffect, useMemo, useState } from "react";
import { Check, Plus, RefreshCw, X, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TagComboboxInput } from "@/components/ui/tag-combobox";
import { ReprocessDialog } from "@/components/reprocess/reprocess-dialog";
import { useImages, useUpdateImage } from "@/hooks/use-images";
import { useCostumes } from "@/hooks/use-costumes";
import { useConstantTags } from "@/hooks/use-constant-tags";
import { useProjectVocabulary } from "@/hooks/use-project-vocabulary";
import { useUiStore } from "@/stores/use-ui-store";
import { sidecar } from "@/lib/sidecar";
import { ciKey } from "@/lib/tag-key";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

/** WD-tagger confidence floor for the "detected but unused" suggestions. */
const SUGGEST_THRESHOLD = 0.35;

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
  const vocabulary = useProjectVocabulary(project.id);
  const update = useUpdateImage(project.id);

  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const image = images.find((i) => i.id === selectedImageId) ?? null;

  const [caption, setCaption] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reprocessOpen, setReprocessOpen] = useState(false);
  useEffect(() => {
    setCaption(image?.caption ?? "");
    setSel(new Set());
  }, [image?.id, image?.caption]);

  const scoreOf = useMemo(() => {
    const m = new Map(image?.tagsAuto.map((t) => [t.tag, t.score]) ?? []);
    return (tag: string) => m.get(tag);
  }, [image?.tagsAuto]);

  // WD-detected tags not (yet) in the final set — offered as one-click chips.
  const suggested = useMemo(() => {
    if (!image) return [];
    const kept = new Set(image.tagsFinal.map(ciKey));
    return image.tagsAuto
      .filter((t) => t.score >= SUGGEST_THRESHOLD && !kept.has(ciKey(t.tag)))
      .sort((a, b) => b.score - a.score);
  }, [image]);

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

  function addTag(raw: string) {
    const t = raw.trim().replace(/,$/, "").trim();
    if (t === "" || tags.some((x) => ciKey(x) === ciKey(t))) return;
    setTags([...tags, t]);
  }

  function removeOne(t: string) {
    setTags(tags.filter((x) => x !== t));
    if (sel.has(t)) {
      const n = new Set(sel);
      n.delete(t);
      setSel(n);
    }
  }

  function toggleSel(t: string) {
    const n = new Set(sel);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    setSel(n);
  }

  function removeSelected() {
    if (sel.size === 0) return;
    setTags(tags.filter((x) => !sel.has(x)));
    setSel(new Set());
  }

  function clearAllTags() {
    if (tags.length === 0) return;
    if (!confirm(`Remove all ${tags.length} tags from this image?`)) return;
    setTags([]);
    setSel(new Set());
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
          onClick={() => setReprocessOpen(true)}
          title="Re-run WD Tagger, costume match & caption — with options"
        >
          <Wand2 className="size-3" />
          Re-tag…
        </Button>
      </div>

      <ReprocessDialog
        project={project}
        open={reprocessOpen}
        onOpenChange={setReprocessOpen}
        scopeIds={[image.id]}
      />

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
          <div className="flex items-center justify-between gap-2">
            <Label>Tags · click to select, ✕ to remove</Label>
            <div className="flex items-center gap-2 text-[11px]">
              {sel.size > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={removeSelected}
                    className="font-medium text-destructive hover:underline"
                  >
                    Remove {sel.size} selected
                  </button>
                  <button
                    type="button"
                    onClick={() => setSel(new Set())}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                tags.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllTags}
                    className="text-muted-foreground hover:text-destructive hover:underline"
                  >
                    Clear all
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-input bg-input/30 p-1.5">
            {tags.map((t) => (
              <span
                key={t}
                onClick={() => toggleSel(t)}
                title="Click to select for group removal"
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium select-none",
                  sel.has(t)
                    ? "bg-destructive/25 text-destructive ring-1 ring-destructive"
                    : scoreClass(scoreOf(t)),
                )}
              >
                {t}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOne(t);
                  }}
                  aria-label={`Remove ${t}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <TagComboboxInput
              suggestions={vocabulary}
              onCommit={addTag}
              exclude={tags}
              placeholder={tags.length === 0 ? "Add tag…" : ""}
            />
          </div>

          {suggested.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                Suggested · detected by WD Tagger, click to add
              </span>
              <div className="flex flex-wrap gap-1">
                {suggested.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => addTag(t.tag)}
                    title={`${(t.score * 100).toFixed(0)}% — click to add`}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-transparent px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Plus className="size-3" />
                    {t.tag}
                  </button>
                ))}
              </div>
            </div>
          )}
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
