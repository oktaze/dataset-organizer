import { useMemo } from "react";
import { Shirt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCostumes } from "@/hooks/use-costumes";
import { useImages } from "@/hooks/use-images";
import { useThumbnail } from "@/hooks/use-thumbnail";
import { useUiStore } from "@/stores/use-ui-store";
import { cn } from "@/lib/utils";
import type { ImageItem, Project } from "@/lib/types";

interface CostumeGridProps {
  project: Project;
}

export function CostumeGrid({ project }: CostumeGridProps) {
  const { data: costumes = [], isLoading: costumesLoading } = useCostumes(
    project.id,
  );
  const { data: images = [], isLoading: imagesLoading } = useImages(project.id);
  const setView = useUiStore((s) => s.setView);
  const setCostumeFilter = useUiStore((s) => s.setCostumeFilter);

  // Bucket images by costume (images already ordered by filename).
  const { byCostume, unassigned } = useMemo(() => {
    const byCostume = new Map<string, ImageItem[]>();
    const unassigned: ImageItem[] = [];
    for (const img of images) {
      if (img.costumeId == null) {
        unassigned.push(img);
        continue;
      }
      const list = byCostume.get(img.costumeId);
      if (list) list.push(img);
      else byCostume.set(img.costumeId, [img]);
    }
    return { byCostume, unassigned };
  }, [images]);

  function open(filter: string) {
    setCostumeFilter(filter);
    setView("gallery");
  }

  const isLoading = costumesLoading || imagesLoading;

  return (
    <section className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">By costume</h2>
        <p className="text-xs text-muted-foreground">
          {costumes.length} costume{costumes.length === 1 ? "" : "s"} ·{" "}
          {images.length} image{images.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Loading…
          </p>
        ) : costumes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-foreground">No costumes yet</p>
            <p className="text-xs text-muted-foreground">
              Add costumes in “Manage” to organize this dataset.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {costumes.map((c) => {
              const imgs = byCostume.get(c.id) ?? [];
              return (
                <CostumeCard
                  key={c.id}
                  name={c.name}
                  count={imgs.length}
                  cover={imgs[0] ?? null}
                  onClick={() => open(c.id)}
                />
              );
            })}
            {unassigned.length > 0 && (
              <CostumeCard
                name="No costume"
                count={unassigned.length}
                cover={unassigned[0] ?? null}
                muted
                onClick={() => open("none")}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

interface CostumeCardProps {
  name: string;
  count: number;
  cover: ImageItem | null;
  muted?: boolean;
  onClick: () => void;
}

function CostumeCard({ name, count, cover, muted, onClick }: CostumeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name} — ${count} image${count === 1 ? "" : "s"}`}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card text-left outline-none transition-colors hover:border-primary/40"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {cover ? (
          <Cover filepath={cover.filepath} alt={name} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Shirt className="size-8 opacity-40" />
          </div>
        )}
        <span className="absolute top-1.5 right-1.5">
          <Badge variant={muted ? "muted" : "default"}>{count}</Badge>
        </span>
      </div>
      <div className="px-2.5 py-2">
        <p
          className={cn(
            "truncate text-sm font-medium",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {count} image{count === 1 ? "" : "s"}
        </p>
      </div>
    </button>
  );
}

function Cover({ filepath, alt }: { filepath: string; alt: string }) {
  const { data: thumb, isLoading, isError } = useThumbnail(filepath);
  return (
    <>
      {isLoading && <div className="absolute inset-0 animate-pulse bg-muted" />}
      {isError && (
        <div className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">
          no preview
        </div>
      )}
      {thumb && (
        <img
          src={thumb}
          alt={alt}
          className="size-full object-cover"
          draggable={false}
        />
      )}
    </>
  );
}
