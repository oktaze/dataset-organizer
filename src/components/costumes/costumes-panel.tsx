import { useState } from "react";
import { CostumeGrid } from "@/components/costumes/costume-grid";
import { CostumeBuilder } from "@/components/costumes/costume-builder";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

type Mode = "overview" | "manage";

const MODES: [Mode, string][] = [
  ["overview", "Overview"],
  ["manage", "Manage"],
];

interface CostumesPanelProps {
  project: Project;
}

/** Single "costumes" tab combining the visual overview (cards → filtered
 *  gallery) and the costume editor, switched via a segmented control. */
export function CostumesPanel({ project }: CostumesPanelProps) {
  const [mode, setMode] = useState<Mode>("overview");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex gap-1 border-b border-border px-3 py-1.5">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              mode === m
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "overview" ? (
        <CostumeGrid project={project} />
      ) : (
        <CostumeBuilder projectId={project.id} />
      )}
    </div>
  );
}
