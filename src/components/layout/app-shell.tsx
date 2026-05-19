import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ProjectSidebar } from "@/components/projects/project-sidebar";
import { Gallery } from "@/components/gallery/gallery";
import { TagEditor } from "@/components/gallery/tag-editor";
import { CostumesPanel } from "@/components/costumes/costumes-panel";
import { StyleConceptBuilder } from "@/components/style/style-concept-builder";
import { StatsPanel } from "@/components/stats/stats-panel";
import { useSidecar, type SidecarStatus } from "@/hooks/use-sidecar";
import { useProjects } from "@/hooks/use-projects";
import { useImages, useUpdateImage } from "@/hooks/use-images";
import { useCostumes } from "@/hooks/use-costumes";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useModelDownload } from "@/hooks/use-model-download";
import { useAppUpdater } from "@/hooks/use-app-updater";
import { ModelDownloadPrompt } from "@/components/model/model-download-prompt";
import { ShortcutsDialog } from "@/components/help/shortcuts-dialog";
import { UpdateBanner } from "@/components/updates/update-banner";
import { LibraryMigrationBanner } from "@/components/updates/library-migration-banner";
import { useProjectStore } from "@/stores/use-project-store";
import { useUiStore, type CenterView } from "@/stores/use-ui-store";
import { useSidecarStore } from "@/stores/use-sidecar-store";
import { formatBytes, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_META: Record<SidecarStatus, { label: string; dot: string }> = {
  ready: { label: "Sidecar ready", dot: "bg-emerald-500" },
  starting: { label: "Sidecar starting…", dot: "bg-amber-500" },
  offline: { label: "Sidecar offline", dot: "bg-red-500" },
};

export function AppShell() {
  const { status, modelLoaded } = useSidecar();
  const restartAttempt = useSidecarStore((s) => s.restartAttempt);
  const meta = STATUS_META[status];
  const model = useModelDownload();
  useAppUpdater();

  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    void getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === activeProjectId) ?? null;
  const isCharacter = project?.type === "character";

  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const setCostumeFilter = useUiStore((s) => s.setCostumeFilter);
  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const setSelectedImage = useUiStore((s) => s.setSelectedImage);
  const lightboxOpen = useUiStore((s) => s.lightboxOpen);
  const helpOpen = useUiStore((s) => s.helpOpen);
  const setHelpOpen = useUiStore((s) => s.setHelpOpen);

  const { data: images = [] } = useImages(activeProjectId);
  const { data: costumes = [] } = useCostumes(activeProjectId);
  const updateImage = useUpdateImage(activeProjectId ?? "");

  // Reset the (store-level) costume filter when switching projects so a
  // costume picked via the by-costume overview doesn't leak across projects.
  useEffect(() => {
    setCostumeFilter("all");
  }, [activeProjectId, setCostumeFilter]);

  // Character: a single "costumes" tab hosts both the overview and the editor
  // (CostumesPanel). "setup" is mapped here defensively (no setup tab anymore
  // for character). Non-character keeps its "setup" → StyleConceptBuilder.
  const costumesPanelView =
    project != null &&
    !!isCharacter &&
    (view === "costumes" || view === "setup");
  const styleSetupView =
    project != null && !isCharacter && view === "setup";
  const statsView = project != null && view === "stats";
  const galleryView =
    project != null &&
    !costumesPanelView &&
    !styleSetupView &&
    !statsView;

  useKeyboardShortcuts({
    enabled: galleryView && !lightboxOpen,
    isCharacter: !!isCharacter,
    images,
    costumes,
    selectedImageId,
    selectImage: setSelectedImage,
    patchImage: (id, patch) => updateImage.mutate({ id, patch }),
    openHelp: () => setHelpOpen(true),
  });

  const tabs: [CenterView, string][] = isCharacter
    ? [
        ["gallery", "gallery"],
        ["costumes", "costumes"],
        ["stats", "stats"],
      ]
    : [
        ["gallery", "gallery"],
        ["setup", "setup"],
        ["stats", "stats"],
      ];

  return (
    <div className="grid h-screen w-screen grid-rows-[1fr_auto] overflow-hidden bg-background text-foreground">
      <div className="grid grid-cols-[260px_1fr_340px] overflow-hidden">
        <ProjectSidebar />

        <main className="flex min-w-0 flex-col overflow-hidden">
          {project == null ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 bg-background text-center">
              <p className="text-sm text-foreground">No project selected</p>
              <p className="text-xs text-muted-foreground">
                Pick a project on the left, or create a new one.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-1 border-b border-border bg-sidebar px-3 py-1.5">
                {tabs.map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      view === v
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {styleSetupView ? (
                <StyleConceptBuilder project={project} />
              ) : statsView ? (
                <StatsPanel project={project} />
              ) : costumesPanelView ? (
                <CostumesPanel project={project} />
              ) : (
                <Gallery project={project} />
              )}
            </>
          )}
        </main>

        {project != null && galleryView ? (
          <TagEditor project={project} />
        ) : (
          <aside className="flex h-full items-center justify-center border-l border-border bg-card p-6">
            <p className="text-center text-xs text-muted-foreground">
              {project == null
                ? "No project selected"
                : "Switch to Gallery to edit tags"}
            </p>
          </aside>
        )}
      </div>

      <footer className="border-t border-border bg-sidebar">
        {model.isDownloading && (
          <div className="px-4 pt-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Downloading WD Tagger model…</span>
              <span>
                {model.percent != null
                  ? `${model.percent.toFixed(0)}%`
                  : formatBytes(model.downloaded)}
                {model.etaSeconds != null &&
                  ` · ETA ${formatDuration(model.etaSeconds)}`}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
              <div
                className={cn(
                  "h-full bg-primary transition-all",
                  model.percent == null && "animate-pulse",
                )}
                style={{ width: `${model.percent ?? 40}%` }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-muted-foreground">
          <span className={cn("size-2 rounded-full", meta.dot)} />
          <span>{meta.label}</span>
          {restartAttempt > 0 && status !== "ready" && (
            <span className="opacity-50">
              · restarting ({restartAttempt}/3)
            </span>
          )}
          {status === "ready" &&
            !model.isDownloading &&
            !model.downloadedOk && (
              <span className="opacity-50">· tagger model not downloaded</span>
            )}
          {status === "ready" &&
            model.downloadedOk &&
            !modelLoaded && (
              <span className="opacity-50">
                · model ready (loads on first tag)
              </span>
            )}
          {appVersion && (
            <span className="ml-auto opacity-60">v{appVersion}</span>
          )}
        </div>
      </footer>

      <ModelDownloadPrompt />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <UpdateBanner />
      <LibraryMigrationBanner />
    </div>
  );
}
