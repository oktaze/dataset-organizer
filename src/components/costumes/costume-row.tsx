import { useState } from "react";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import { useUpdateCostume, useDeleteCostume } from "@/hooks/use-costumes";
import type { Costume } from "@/lib/types";

interface CostumeRowProps {
  costume: Costume;
  projectId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
}

export function CostumeRow({
  costume,
  projectId,
  canMoveUp,
  canMoveDown,
  onMove,
}: CostumeRowProps) {
  const [name, setName] = useState(costume.name);
  const [trigger, setTrigger] = useState(costume.trigger ?? "");
  const [tags, setTags] = useState<string[]>(costume.tags);
  const [colorTags, setColorTags] = useState<string[]>(costume.colorTags);

  const update = useUpdateCostume(projectId);
  const del = useDeleteCostume(projectId);

  const dirty =
    name !== costume.name ||
    trigger !== (costume.trigger ?? "") ||
    JSON.stringify(tags) !== JSON.stringify(costume.tags) ||
    JSON.stringify(colorTags) !== JSON.stringify(costume.colorTags);

  async function save() {
    await update.mutateAsync({
      id: costume.id,
      patch: {
        name: name.trim(),
        trigger: trigger.trim() === "" ? null : trigger.trim(),
        tags,
        colorTags,
      },
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Costume name"
          className="flex-1 font-medium"
        />
        <Input
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          placeholder="trigger (optional)"
          className="w-40"
        />
        <Button
          size="sm"
          onClick={save}
          disabled={!dirty || update.isPending || name.trim() === ""}
        >
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          size="icon-sm"
          variant="destructive"
          onClick={() => del.mutate(costume.id)}
          aria-label="Delete costume"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Canonical tags (always captioned)</Label>
          <TagInput value={tags} onChange={setTags} placeholder="school_uniform…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Signature color tags</Label>
          <TagInput
            value={colorTags}
            onChange={setColorTags}
            placeholder="blue_ribbon…"
            chipClassName="bg-chart-4/20 text-chart-4"
          />
        </div>
      </div>
    </div>
  );
}
