import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useImages } from "@/hooks/use-images";
import { useCostumes } from "@/hooks/use-costumes";
import { useUiStore } from "@/stores/use-ui-store";
import {
  STATUS_ORDER,
  countByStatus,
  countByCostume,
  tagFrequency,
  imbalanceWarnings,
} from "@/lib/stats";
import { cn } from "@/lib/utils";
import type { ImageStatus, Project } from "@/lib/types";

const STATUS_BAR: Record<ImageStatus, string> = {
  pending: "bg-muted-foreground",
  tagged: "bg-amber-500",
  validated: "bg-emerald-500",
  exported: "bg-primary",
};

const TOP_TAGS = 30;

interface StatsPanelProps {
  project: Project;
}

export function StatsPanel({ project }: StatsPanelProps) {
  const { data: images = [] } = useImages(project.id);
  const { data: costumes = [] } = useCostumes(project.id);
  const isCharacter = project.type === "character";

  const setCostumeFilter = useUiStore((s) => s.setCostumeFilter);
  const setView = useUiStore((s) => s.setView);
  const [showAllTags, setShowAllTags] = useState(false);

  const status = useMemo(() => countByStatus(images), [images]);
  const costumeCounts = useMemo(
    () => countByCostume(images, costumes),
    [images, costumes],
  );
  const tags = useMemo(() => tagFrequency(images), [images]);
  const warnings = useMemo(
    () => imbalanceWarnings(images, costumes, isCharacter),
    [images, costumes, isCharacter],
  );

  const total = images.length;
  const shownTags = showAllTags ? tags : tags.slice(0, TOP_TAGS);

  function drillCostume(id: string | null) {
    setCostumeFilter(id ?? "none");
    setView("gallery");
  }

  if (total === 0) {
    return (
      <section className="flex h-full items-center justify-center bg-background">
        <p className="text-xs text-muted-foreground">
          No images yet — import a dataset to see stats.
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-full flex-col overflow-y-auto bg-background">
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">
          Dataset stats
        </h2>
        <p className="text-xs text-muted-foreground">
          {total} image{total === 1 ? "" : "s"} · {tags.length} unique tags
        </p>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {warnings.length > 0 && (
          <div className="lg:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-500">
              <AlertTriangle className="size-3.5" />
              Balance warnings
            </div>
            <ul className="space-y-1 text-[11px] text-amber-200/90">
              {warnings.map((w) => (
                <li key={w}>· {w}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-medium text-foreground">
            By status
          </h3>
          <div className="space-y-1.5">
            {STATUS_ORDER.map((s) => {
              const n = status[s];
              const pct = total > 0 ? (n / total) * 100 : 0;
              return (
                <div key={s} className="text-[11px]">
                  <div className="mb-0.5 flex justify-between text-muted-foreground">
                    <span className="capitalize">{s}</span>
                    <span>
                      {n} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-muted">
                    <div
                      className={cn("h-full", STATUS_BAR[s])}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isCharacter && (
          <div>
            <h3 className="mb-2 text-xs font-medium text-foreground">
              By costume
            </h3>
            <div className="space-y-0.5">
              {costumeCounts.map((c) => (
                <button
                  key={c.id ?? "__none__"}
                  type="button"
                  onClick={() => drillCostume(c.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Show these images in the gallery"
                >
                  <span className="truncate">{c.name}</span>
                  <span>{c.count}</span>
                </button>
              ))}
              {costumeCounts.length === 0 && (
                <p className="px-2 py-1 text-[11px] text-muted-foreground">
                  No costumes defined.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-foreground">
              Tag frequency
            </h3>
            {tags.length > TOP_TAGS && (
              <button
                type="button"
                onClick={() => setShowAllTags((v) => !v)}
                className="text-[11px] text-primary hover:underline"
              >
                {showAllTags ? "Show top 30" : `Show all ${tags.length}`}
              </button>
            )}
          </div>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {shownTags.map((t) => (
              <div
                key={t.tag}
                className="flex items-center gap-2 text-[11px]"
              >
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                  {t.count}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className={cn(
                      "h-full",
                      t.pct > 80 ? "bg-amber-500" : "bg-primary/70",
                    )}
                    style={{ width: `${Math.max(2, t.pct)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 truncate text-foreground">
                  {t.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
