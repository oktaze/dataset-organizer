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

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ProjectType>("character");
  const [trigger, setTrigger] = useState("");
  const [baseModel, setBaseModel] = useState<string>(DEFAULT_BASE_MODEL);

  const createProject = useCreateProject();
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const canSubmit = name.trim() !== "" && trigger.trim() !== "";

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
    setName("");
    setTrigger("");
    setType("character");
    setBaseModel(DEFAULT_BASE_MODEL);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New LoRA project</DialogTitle>
          <DialogDescription>
            Character projects unlock costume detection on import.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-3">
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
            <Label htmlFor="np-type">Type</Label>
            <Select
              id="np-type"
              value={type}
              onChange={(e) => setType(e.target.value as ProjectType)}
            >
              <option value="character">Character</option>
              <option value="style">Style</option>
              <option value="concept">Concept</option>
            </Select>
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
