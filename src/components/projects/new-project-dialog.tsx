import { useState } from "react";
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
import { useCreateProject } from "@/hooks/use-projects";
import { useProjectStore } from "@/stores/use-project-store";
import { BASE_MODELS, DEFAULT_BASE_MODEL, type ProjectType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_TYPE: ProjectType = "concept";

/** Type drives the whole flow (only Character unlocks costumes), so it's the
 *  first, most prominent choice. `hint` explains each type inline. */
const PROJECT_TYPES: { value: ProjectType; label: string; hint: string }[] = [
  {
    value: "character",
    label: "Character",
    hint: "Define costumes — auto-detected and tagged on each import.",
  },
  {
    value: "style",
    label: "Style",
    hint: "Capture an art style. Simplified flow, no costumes.",
  },
  {
    value: "concept",
    label: "Concept",
    hint: "Teach a concept or object. Simplified flow, no costumes.",
  },
];

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const [type, setType] = useState<ProjectType>(DEFAULT_TYPE);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [baseModel, setBaseModel] = useState<string>(DEFAULT_BASE_MODEL);

  const createProject = useCreateProject();
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const canSubmit = name.trim() !== "" && trigger.trim() !== "";
  const activeType =
    PROJECT_TYPES.find((t) => t.value === type) ?? PROJECT_TYPES[0];

  function reset() {
    setType(DEFAULT_TYPE);
    setName("");
    setTrigger("");
    setBaseModel(DEFAULT_BASE_MODEL);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || createProject.isPending) return;
    const project = await createProject.mutateAsync({
      name: name.trim(),
      type,
      trigger: trigger.trim(),
      baseModel: baseModel || DEFAULT_BASE_MODEL,
    });
    setActiveProject(project.id);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New LoRA project</DialogTitle>
          <DialogDescription>
            Pick a type, then name it and set its trigger word.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* 1. Type — the defining choice, first. */}
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <div
              role="radiogroup"
              aria-label="Project type"
              className="grid grid-cols-3 gap-1.5"
            >
              {PROJECT_TYPES.map((t) => {
                const active = t.value === type;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setType(t.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{activeType.hint}</p>
          </div>

          {/* 2. Identity — name + trigger. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-name">Name</Label>
            <Input
              id="np-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="Miyuki"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-trigger">Trigger word</Label>
            <Input
              id="np-trigger"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="miyuki"
            />
          </div>

          {/* 3. Target base model. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-model">Base model</Label>
            <Select
              id="np-model"
              value={baseModel}
              onChange={(e) => setBaseModel(e.target.value)}
            >
              {BASE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
