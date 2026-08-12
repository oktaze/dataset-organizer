import { useState } from "react";
import { Check, Loader2, Tags, Trash2, X, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { TagCombobox } from "@/components/ui/tag-combobox";
import { useBulkImageActions } from "@/hooks/use-images";
import { useProjectVocabulary } from "@/hooks/use-project-vocabulary";
import { useUiStore } from "@/stores/use-ui-store";
import { cn } from "@/lib/utils";
import type { Costume, Project } from "@/lib/types";

type InsertPos = "end" | "start";

interface BulkActionBarProps {
  project: Project;
  costumes: Costume[];
  isCharacter: boolean;
  /** Open the reprocess (WD Tagger / caption) dialog scoped to these ids. */
  onRetag: (ids: string[]) => void;
}

function Divider() {
  return <span className="h-4 w-px shrink-0 bg-border" aria-hidden />;
}

/** Contextual multi-selection toolbar. Renders as its own row below the
 *  filters, only when a selection exists. Groups the actions (selection ·
 *  status/tagging · tag editing · costume · destructive) so they stay legible
 *  instead of wrapping into one dense line. */
export function BulkActionBar({
  project,
  costumes,
  isCharacter,
  onRetag,
}: BulkActionBarProps) {
  const bulk = useBulkImageActions(project);
  const vocabulary = useProjectVocabulary(project.id);
  const bulkIds = useUiStore((s) => s.bulkIds);
  const clearBulk = useUiStore((s) => s.clearBulk);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTags, setComposerTags] = useState<string[]>([]);
  const [pos, setPos] = useState<InsertPos>("end");

  const count = bulkIds.length;
  if (count === 0) return null;

  function addTags() {
    if (composerTags.length === 0) return;
    bulk.addTag.mutate({
      ids: bulkIds,
      tags: composerTags,
      position: pos === "start" ? 0 : undefined,
    });
    setComposerTags([]);
  }

  function removeTags() {
    if (composerTags.length === 0) return;
    bulk.removeTag.mutate({ ids: bulkIds, tags: composerTags });
    setComposerTags([]);
  }

  async function del() {
    if (!confirm(`Delete ${count} selected image(s)?`)) return;
    await bulk.remove.mutateAsync(bulkIds);
    clearBulk();
  }

  return (
    <div className="border-b border-border bg-primary/5">
      <div className="flex flex-wrap items-center gap-2 px-5 py-2">
        {/* Selection */}
        <span className="text-[11px] font-medium text-foreground">
          {count} selected
        </span>
        <Button size="xs" variant="ghost" onClick={clearBulk}>
          <X className="size-3" />
          Clear
        </Button>

        <Divider />

        {/* Status / tagging */}
        <Button
          size="xs"
          onClick={() =>
            bulk.setStatus.mutate({ ids: bulkIds, status: "validated" })
          }
        >
          <Check className="size-3" />
          Validate
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() =>
            bulk.setStatus.mutate({ ids: bulkIds, status: "tagged" })
          }
        >
          Mark tagged
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={() => onRetag(bulkIds)}
          title="Run WD Tagger / caption on the selected images only"
        >
          <Tags className="size-3" />
          Re-tag
        </Button>

        <Divider />

        {/* Tag editing */}
        <Button
          size="xs"
          variant={composerOpen ? "secondary" : "outline"}
          aria-expanded={composerOpen}
          onClick={() => setComposerOpen((o) => !o)}
        >
          <Tags className="size-3" />
          Edit tags
        </Button>

        <Divider />

        {/* Costume */}
        {isCharacter && (
          <Select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") return;
              bulk.setCostume.mutate({
                ids: bulkIds,
                costumeId: v === "none" ? null : v,
              });
            }}
            className="h-6 w-auto text-xs"
          >
            <option value="">Assign costume…</option>
            <option value="none">— none —</option>
            {costumes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}

        {/* Destructive, pushed to the far right */}
        <div className="ml-auto">
          <Button size="xs" variant="destructive" onClick={() => void del()}>
            <Trash2 className="size-3" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tag composer sub-row */}
      {composerOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-5 py-2">
          <div className="min-w-56 flex-1">
            <TagCombobox
              value={composerTags}
              onChange={setComposerTags}
              suggestions={vocabulary}
              placeholder="Type a tag, Enter to add…"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Position</span>
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setPos("end")}
                className={cn(
                  "px-2 py-0.5 text-[11px] font-medium transition-colors",
                  pos === "end"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                End
              </button>
              <button
                type="button"
                onClick={() => setPos("start")}
                title="Insert at the start — right after the trigger and costume tags in the caption"
                className={cn(
                  "border-l border-border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  pos === "start"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Start
              </button>
            </div>
          </div>

          <Button
            size="xs"
            variant="secondary"
            onClick={addTags}
            disabled={composerTags.length === 0 || bulk.addTag.isPending}
          >
            <Plus className="size-3" />
            Add to {count}
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={removeTags}
            disabled={composerTags.length === 0 || bulk.removeTag.isPending}
          >
            <Minus className="size-3" />
            Remove from {count}
          </Button>

          <Button
            size="xs"
            variant="ghost"
            onClick={() => bulk.rebuildCaptions.mutate(bulkIds)}
            disabled={bulk.rebuildCaptions.isPending}
            title="Reassemble captions from current tags & costume"
          >
            {bulk.rebuildCaptions.isPending && (
              <Loader2 className="size-3 animate-spin" />
            )}
            Rebuild captions
          </Button>
        </div>
      )}
    </div>
  );
}
