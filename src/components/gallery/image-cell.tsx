import { type MouseEvent } from "react";
import { Check, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useThumbnail } from "@/hooks/use-thumbnail";
import { cn } from "@/lib/utils";
import type { ImageItem, ImageStatus } from "@/lib/types";

const STATUS_DOT: Record<ImageStatus, string> = {
  pending: "bg-muted-foreground",
  tagged: "bg-amber-500",
  validated: "bg-emerald-500",
  exported: "bg-primary",
};

interface ImageCellProps {
  image: ImageItem;
  costumeName: string | null;
  /** Focused (drives the tag editor). */
  selected: boolean;
  /** In the bulk-review multi-selection. */
  checked: boolean;
  onSelect: () => void;
  onToggle: (e: MouseEvent) => void;
  /** Open the full-screen preview for this image. */
  onOpen: () => void;
}

export function ImageCell({
  image,
  costumeName,
  selected,
  checked,
  onSelect,
  onToggle,
  onOpen,
}: ImageCellProps) {
  const { data: thumb, isLoading, isError } = useThumbnail(image.filepath);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
        else if (e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      title={`${image.filename} — double-click to enlarge`}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left outline-none transition-colors",
        selected
          ? "border-primary ring-2 ring-primary/50"
          : checked
            ? "border-primary/60"
            : "border-border hover:border-primary/40",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {isLoading && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}
        {isError && (
          <div className="absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">
            no preview
          </div>
        )}
        {thumb && (
          <img
            src={thumb}
            alt={image.filename}
            className="size-full object-cover"
            draggable={false}
          />
        )}
        {checked && (
          <div className="pointer-events-none absolute inset-0 bg-primary/25" />
        )}

        <button
          type="button"
          aria-label={checked ? "Deselect" : "Select"}
          aria-pressed={checked}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(e);
          }}
          className={cn(
            "absolute top-1.5 left-1.5 grid size-4 place-items-center rounded border transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/60 bg-black/40 text-transparent opacity-0 group-hover:opacity-100",
          )}
        >
          <Check className="size-3" />
        </button>

        <span
          className={cn(
            "absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-black/40",
            STATUS_DOT[image.status],
          )}
          title={image.status}
        />

        <button
          type="button"
          aria-label="Enlarge"
          title="Enlarge"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-md border border-white/50 bg-black/50 text-white/90 opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
        >
          <Maximize2 className="size-3" />
        </button>
        {costumeName && (
          <div className="absolute bottom-1.5 left-1.5">
            <Badge variant="default">{costumeName}</Badge>
          </div>
        )}
      </div>
      <span className="truncate px-2 py-1 text-[11px] text-muted-foreground">
        {image.filename}
      </span>
    </div>
  );
}
