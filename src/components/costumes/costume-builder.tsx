import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CostumeRow } from "@/components/costumes/costume-row";
import { ConstantTagsSection } from "@/components/costumes/constant-tags-section";
import {
  useCostumes,
  useCreateCostume,
  useUpdateCostume,
} from "@/hooks/use-costumes";

interface CostumeBuilderProps {
  projectId: string;
}

export function CostumeBuilder({ projectId }: CostumeBuilderProps) {
  const { data: costumes = [], isLoading } = useCostumes(projectId);
  const create = useCreateCostume(projectId);
  const update = useUpdateCostume(projectId);
  const [newName, setNewName] = useState("");

  async function addCostume() {
    const name = newName.trim();
    if (name === "" || create.isPending) return;
    await create.mutateAsync({
      projectId,
      name,
      trigger: null,
      tags: [],
      colorTags: [],
    });
    setNewName("");
  }

  async function move(index: number, dir: -1 | 1) {
    const a = costumes[index];
    const b = costumes[index + dir];
    if (!a || !b) return;
    await Promise.all([
      update.mutateAsync({ id: a.id, patch: { sortOrder: b.sortOrder } }),
      update.mutateAsync({ id: b.id, patch: { sortOrder: a.sortOrder } }),
    ]);
  }

  return (
    <section className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">Costumes</h2>
        <p className="text-xs text-muted-foreground">
          Canonical tag sets detected automatically on import.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCostume()}
            placeholder="New costume name (e.g. School Uniform)"
            className="flex-1"
          />
          <Button onClick={addCostume} disabled={create.isPending}>
            <Plus className="size-3.5" />
            Add costume
          </Button>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : (
          costumes.map((c, i) => (
            <CostumeRow
              key={c.id}
              costume={c}
              projectId={projectId}
              canMoveUp={i > 0}
              canMoveDown={i < costumes.length - 1}
              onMove={(dir) => move(i, dir)}
            />
          ))
        )}

        <ConstantTagsSection projectId={projectId} />
      </div>
    </section>
  );
}
