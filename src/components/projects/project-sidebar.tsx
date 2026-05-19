import { useState } from "react";
import { Plus, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useProjects, useDeleteProject } from "@/hooks/use-projects";
import { useProjectStore } from "@/stores/use-project-store";
import { useUiStore } from "@/stores/use-ui-store";
import { cn } from "@/lib/utils";

export function ProjectSidebar() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: projects = [], isLoading } = useProjects();
  const deleteProject = useDeleteProject();

  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setSelectedImage = useUiStore((s) => s.setSelectedImage);

  function select(id: string) {
    setActiveProject(id);
    setSelectedImage(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this project and all its images/costumes?")) return;
    await deleteProject.mutateAsync(id);
    if (activeProjectId === id) setActiveProject(null);
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3.5">
        <h1 className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Dataset Organizer
        </h1>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Settings"
        >
          <Settings className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Projects
        </span>
        <Button size="xs" onClick={() => setDialogOpen(true)}>
          <Plus className="size-3" />
          New
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : projects.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            No projects yet.
            <br />
            <span className="opacity-60">Create one to get started.</span>
          </p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((p) => (
              <li key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => select(p.id)}
                  onKeyDown={(e) => e.key === "Enter" && select(p.id)}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
                    p.id === activeProjectId
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  <Badge variant={p.id === activeProjectId ? "default" : "muted"}>
                    {p.type}
                  </Badge>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(p.id);
                    }}
                    className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label="Delete project"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}
