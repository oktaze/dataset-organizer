import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FolderOpen,
  Images,
  Loader2,
  Download,
  Tags,
  X,
  Search,
  Filter,
  MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagComboboxInput } from "@/components/ui/tag-combobox";
import { ImageCell } from "@/components/gallery/image-cell";
import { ImageLightbox } from "@/components/gallery/image-lightbox";
import { BulkActionBar } from "@/components/gallery/bulk-action-bar";
import { CurateButton } from "@/components/gallery/curate-button";
import { ExportDialog } from "@/components/export/export-dialog";
import { ReprocessDialog } from "@/components/reprocess/reprocess-dialog";
import { useImages, useUndo } from "@/hooks/use-images";
import { useCostumes } from "@/hooks/use-costumes";
import { useProjectVocabulary } from "@/hooks/use-project-vocabulary";
import { useImport } from "@/hooks/use-import";
import { useUiStore } from "@/stores/use-ui-store";
import { ciKey } from "@/lib/tag-key";
import { cn } from "@/lib/utils";
import type { ImageStatus, Project } from "@/lib/types";

type TagFilter = { tag: string; mode: "has" | "missing" };

const CELL = 172;
const ROW_H = 200;

const STATUSES: ImageStatus[] = [
  "pending",
  "tagged",
  "validated",
  "exported",
];

interface GalleryProps {
  project: Project;
}

export function Gallery({ project }: GalleryProps) {
  const { data: images = [], isLoading } = useImages(project.id);
  const { data: costumes = [] } = useCostumes(project.id);
  const vocabulary = useProjectVocabulary(project.id);
  const { run, runFiles, running, progress, error, skipped, skippedMsg } =
    useImport();
  const undo = useUndo(project);
  const [exportOpen, setExportOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  // Snapshot of ids to tag; null = whole project (header button).
  const [reprocessScope, setReprocessScope] = useState<string[] | null>(
    null,
  );

  const [statusFilter, setStatusFilter] = useState<"all" | ImageStatus>(
    "all",
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  // Facet filter: image must have every "has" tag and no "missing" tag.
  const [tagFilters, setTagFilters] = useState<TagFilter[]>([]);
  const costumeFilter = useUiStore((s) => s.costumeFilter);
  const setCostumeFilter = useUiStore((s) => s.setCostumeFilter);
  const selectMode = useUiStore((s) => s.selectMode);
  const setSelectMode = useUiStore((s) => s.setSelectMode);

  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const setSelectedImage = useUiStore((s) => s.setSelectedImage);
  const openLightbox = useUiStore((s) => s.openLightbox);
  const bulkIds = useUiStore((s) => s.bulkIds);
  const setBulk = useUiStore((s) => s.setBulk);
  const toggleBulk = useUiStore((s) => s.toggleBulk);
  const clearBulk = useUiStore((s) => s.clearBulk);

  const isCharacter = project.type === "character";
  const costumeName = useMemo(() => {
    const map = new Map(costumes.map((c) => [c.id, c.name]));
    return (id: string | null): string | null =>
      id ? (map.get(id) ?? null) : null;
  }, [costumes]);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const has = tagFilters
      .filter((f) => f.mode === "has")
      .map((f) => ciKey(f.tag));
    const missing = tagFilters
      .filter((f) => f.mode === "missing")
      .map((f) => ciKey(f.tag));
    return images.filter((img) => {
      if (statusFilter !== "all" && img.status !== statusFilter) {
        return false;
      }
      if (costumeFilter === "none" && img.costumeId != null) return false;
      if (
        costumeFilter !== "all" &&
        costumeFilter !== "none" &&
        img.costumeId !== costumeFilter
      ) {
        return false;
      }
      if (has.length > 0 || missing.length > 0) {
        const keys = new Set(img.tagsFinal.map(ciKey));
        if (!has.every((k) => keys.has(k))) return false;
        if (missing.some((k) => keys.has(k))) return false;
      }
      if (q !== "") {
        const hay =
          img.filename.toLowerCase() +
          " " +
          img.tagsFinal.join(" ").toLowerCase() +
          " " +
          (img.caption ?? "").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [images, statusFilter, costumeFilter, deferredQuery, tagFilters]);

  const bulkSet = useMemo(() => new Set(bulkIds), [bulkIds]);
  const imageIds = useMemo(() => images.map((i) => i.id), [images]);

  // Reset selection/status when the project changes. The costume filter is
  // reset at the AppShell level (it lives in the store so the by-costume
  // overview can drill in pre-filtered without a remount wiping it).
  useEffect(() => {
    clearBulk();
    setStatusFilter("all");
    setQuery("");
    setTagFilters([]);
    setSelectMode(false);
  }, [project.id, clearBulk, setSelectMode]);

  // Auto-dismiss the undo affordance after a short window. Depending on the
  // whole `undo` object would re-arm the timer every render (it's rebuilt
  // each time); the primitives below are the real triggers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!undo.hasUndo) return;
    const t = setTimeout(() => undo.dismiss(), 10000);
    return () => clearTimeout(t);
  }, [undo.label, undo.hasUndo, undo.dismiss]);

  const anchor = useRef<number | null>(null);
  function onToggle(index: number, e: { shiftKey: boolean }) {
    const id = visible[index]?.id;
    if (!id) return;
    if (e.shiftKey && anchor.current != null) {
      const [a, b] = [anchor.current, index].sort((x, y) => x - y);
      const range = visible.slice(a, b + 1).map((i) => i.id);
      setBulk(Array.from(new Set([...bulkIds, ...range])));
    } else {
      toggleBulk(id);
      anchor.current = index;
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((width - 1) / CELL));
  const rowCount = Math.ceil(visible.length / cols);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 4,
  });

  const allVisibleSelected =
    visible.length > 0 && visible.every((i) => bulkSet.has(i.id));

  function addTagFilter(tag: string) {
    setTagFilters((prev) =>
      prev.some((f) => ciKey(f.tag) === ciKey(tag))
        ? prev
        : [...prev, { tag, mode: "has" }],
    );
  }
  function toggleTagFilter(tag: string) {
    setTagFilters((prev) =>
      prev.map((f) =>
        f.tag === tag
          ? { ...f, mode: f.mode === "has" ? "missing" : "has" }
          : f,
      ),
    );
  }
  function removeTagFilter(tag: string) {
    setTagFilters((prev) => prev.filter((f) => f.tag !== tag));
  }

  function openRetag(ids: string[]) {
    setReprocessScope(ids);
    setReprocessOpen(true);
  }

  return (
    <section className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium text-foreground">
            {project.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {visible.length}/{images.length} image
            {images.length === 1 ? "" : "s"} · trigger “{project.trigger}”
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setReprocessScope(null);
            setReprocessOpen(true);
          }}
          disabled={images.length === 0 || running}
        >
          <Tags className="size-3.5" />
          Tag images
        </Button>
        <CurateButton project={project} imageIds={imageIds} />
        <Button
          variant="outline"
          onClick={() => setExportOpen(true)}
          disabled={images.length === 0}
        >
          <Download className="size-3.5" />
          Export
        </Button>
        <Button
          variant="outline"
          onClick={() => void runFiles(project)}
          disabled={running}
        >
          <Images className="size-3.5" />
          Import files
        </Button>
        <Button onClick={() => void run(project)} disabled={running}>
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FolderOpen className="size-3.5" />
          )}
          Import folder
        </Button>
      </header>

      {images.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filename / tag / caption…"
              className="h-7 w-56 pl-7 text-xs"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | ImageStatus)
            }
            className="h-7 w-auto text-xs"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          {isCharacter && (
            <Select
              value={costumeFilter}
              onChange={(e) => setCostumeFilter(e.target.value)}
              className="h-7 w-auto text-xs"
            >
              <option value="all">All costumes</option>
              <option value="none">No costume</option>
              {costumes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}

          {/* Tag facet filter */}
          <div className="flex h-7 items-center rounded-md border border-input bg-input/30 px-2">
            <Filter className="mr-1 size-3 shrink-0 text-muted-foreground" />
            <TagComboboxInput
              suggestions={vocabulary}
              onCommit={addTagFilter}
              exclude={tagFilters.map((f) => f.tag)}
              placeholder="Filter by tag…"
              className="w-32 text-xs"
            />
          </div>
          {tagFilters.map((f) => (
            <button
              key={f.tag}
              type="button"
              onClick={() => toggleTagFilter(f.tag)}
              title={
                f.mode === "has"
                  ? "Has this tag — click to invert"
                  : "Missing this tag — click to invert"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                f.mode === "has"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-destructive/20 text-destructive line-through",
              )}
            >
              {f.mode === "missing" && <span className="no-underline">−</span>}
              {f.tag}
              <span
                role="button"
                aria-label={`Remove filter ${f.tag}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTagFilter(f.tag);
                }}
                className="text-current/70 hover:text-current"
              >
                <X className="size-3" />
              </span>
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="xs"
              variant={selectMode ? "secondary" : "ghost"}
              onClick={() => {
                const next = !selectMode;
                setSelectMode(next);
                if (!next) clearBulk();
              }}
              title="Toggle selection mode — click images to select them"
            >
              <MousePointerClick className="size-3" />
              {selectMode ? "Selecting" : "Select"}
            </Button>

            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                allVisibleSelected
                  ? clearBulk()
                  : setBulk(visible.map((i) => i.id))
              }
              disabled={visible.length === 0}
            >
              {allVisibleSelected
                ? "Deselect all"
                : `Select all (${visible.length})`}
            </Button>
          </div>
        </div>
      )}

      <BulkActionBar
        project={project}
        costumes={costumes}
        isCharacter={isCharacter}
        onRetag={openRetag}
      />

      <ExportDialog
        project={project}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <ReprocessDialog
        project={project}
        open={reprocessOpen}
        onOpenChange={setReprocessOpen}
        scopeIds={reprocessScope ?? undefined}
      />
      <ImageLightbox images={visible} costumeName={costumeName} />

      {progress && (
        <div className="border-b border-border px-5 py-2">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{progress.phase}</span>
            <span>
              {progress.done}/{progress.total || "…"}
            </span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: progress.total
                  ? `${(progress.done / progress.total) * 100}%`
                  : "30%",
              }}
            />
          </div>
        </div>
      )}
      {error && (
        <p className="border-b border-border bg-destructive/10 px-5 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      )}
      {skippedMsg && (
        <p
          className="border-b border-border bg-amber-500/10 px-5 py-1.5 text-[11px] text-amber-500"
          title={skipped.join("\n")}
        >
          {skippedMsg}
        </p>
      )}
      {undo.hasUndo && undo.label && (
        <div className="flex items-center gap-3 border-b border-border bg-primary/10 px-5 py-1.5 text-[11px] text-foreground">
          <span className="flex-1 truncate">{undo.label}</span>
          <button
            type="button"
            onClick={() => undo.undo.mutate()}
            disabled={undo.undo.isPending}
            className="font-medium text-primary hover:underline disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => undo.dismiss()}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : images.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-foreground">No images yet</p>
            <p className="text-xs text-muted-foreground">
              Import a folder or files to scan, tag and caption a dataset.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No images match these filters.
          </p>
        ) : (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const start = vr.index * cols;
              const rowImages = visible.slice(start, start + cols);
              return (
                <div
                  key={vr.key}
                  className="grid gap-3"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: ROW_H,
                    transform: `translateY(${vr.start}px)`,
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {rowImages.map((img, idx) => (
                    <ImageCell
                      key={img.id}
                      image={img}
                      costumeName={costumeName(img.costumeId)}
                      selected={img.id === selectedImageId}
                      checked={bulkSet.has(img.id)}
                      selectMode={selectMode}
                      onSelect={() => setSelectedImage(img.id)}
                      onToggle={(e) => onToggle(start + idx, e)}
                      onOpen={() => openLightbox(img.id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
