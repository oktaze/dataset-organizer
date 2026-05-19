import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FolderOpen,
  Images,
  Loader2,
  Download,
  Tags,
  Check,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ImageCell } from "@/components/gallery/image-cell";
import { ImageLightbox } from "@/components/gallery/image-lightbox";
import { ExportDialog } from "@/components/export/export-dialog";
import { ReprocessDialog } from "@/components/reprocess/reprocess-dialog";
import { useImages, useBulkImageActions } from "@/hooks/use-images";
import { useCostumes } from "@/hooks/use-costumes";
import { useImport } from "@/hooks/use-import";
import { useUiStore } from "@/stores/use-ui-store";
import type { ImageStatus, Project } from "@/lib/types";

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
  const { run, runFiles, running, progress, error } = useImport();
  const bulk = useBulkImageActions(project.id);
  const [exportOpen, setExportOpen] = useState(false);
  const [reprocessOpen, setReprocessOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | ImageStatus>(
    "all",
  );
  const costumeFilter = useUiStore((s) => s.costumeFilter);
  const setCostumeFilter = useUiStore((s) => s.setCostumeFilter);

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

  const visible = useMemo(
    () =>
      images.filter((img) => {
        if (statusFilter !== "all" && img.status !== statusFilter) {
          return false;
        }
        if (costumeFilter === "all") return true;
        if (costumeFilter === "none") return img.costumeId == null;
        return img.costumeId === costumeFilter;
      }),
    [images, statusFilter, costumeFilter],
  );

  const bulkSet = useMemo(() => new Set(bulkIds), [bulkIds]);

  // Reset selection/status when the project changes. The costume filter is
  // reset at the AppShell level (it lives in the store so the by-costume
  // overview can drill in pre-filtered without a remount wiping it).
  useEffect(() => {
    clearBulk();
    setStatusFilter("all");
  }, [project.id, clearBulk]);

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

  const selCount = bulkIds.length;
  async function bulkDelete() {
    if (!confirm(`Delete ${selCount} selected image(s)?`)) return;
    await bulk.remove.mutateAsync(bulkIds);
    clearBulk();
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
          onClick={() => setReprocessOpen(true)}
          disabled={images.length === 0 || running}
        >
          <Tags className="size-3.5" />
          Tag images
        </Button>
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

          <Button
            size="xs"
            variant="ghost"
            onClick={() => setBulk(visible.map((i) => i.id))}
            disabled={visible.length === 0}
          >
            Select all ({visible.length})
          </Button>

          {selCount > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {selCount} selected
              </span>
              <Button
                size="xs"
                onClick={() =>
                  bulk.setStatus.mutate({
                    ids: bulkIds,
                    status: "validated",
                  })
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
              <Button
                size="xs"
                variant="destructive"
                onClick={() => void bulkDelete()}
              >
                <Trash2 className="size-3" />
                Delete
              </Button>
              <Button size="xs" variant="ghost" onClick={clearBulk}>
                <X className="size-3" />
                Clear
              </Button>
            </div>
          )}
        </div>
      )}

      <ExportDialog
        project={project}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
      <ReprocessDialog
        project={project}
        open={reprocessOpen}
        onOpenChange={setReprocessOpen}
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
