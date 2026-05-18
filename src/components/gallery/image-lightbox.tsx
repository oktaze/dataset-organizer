import { useCallback, useEffect } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLargeImage } from "@/hooks/use-thumbnail";
import { useUiStore } from "@/stores/use-ui-store";
import type { ImageItem } from "@/lib/types";

interface ImageLightboxProps {
  /** The currently visible (filtered) image list — navigation stays in it. */
  images: ImageItem[];
  costumeName: (id: string | null) => string | null;
}

/** Full-screen preview of the focused image, with wrap-around prev/next
 *  navigation over the filtered gallery list. Esc / backdrop close it. */
export function ImageLightbox({ images, costumeName }: ImageLightboxProps) {
  const open = useUiStore((s) => s.lightboxOpen);
  const close = useUiStore((s) => s.closeLightbox);
  const selectedImageId = useUiStore((s) => s.selectedImageId);
  const setSelectedImage = useUiStore((s) => s.setSelectedImage);

  const index = images.findIndex((i) => i.id === selectedImageId);
  const image = index >= 0 ? images[index] : null;

  const step = useCallback(
    (delta: number) => {
      if (images.length === 0) return;
      const next = (index + delta + images.length) % images.length;
      setSelectedImage(images[next].id);
    },
    [images, index, setSelectedImage],
  );

  // The focused image fell out of the filtered list (filter changed) — bail.
  useEffect(() => {
    if (open && image == null) close();
  }, [open, image, close]);

  // Arrow / A-D navigation while the preview is up. Esc is handled by Radix.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();
      if (e.key === "ArrowLeft" || k === "a") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight" || k === "d") {
        e.preventDefault();
        step(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  const { data: src, isLoading, isError } = useLargeImage(
    open && image ? image.filepath : null,
  );

  if (!image) return null;
  const costume = costumeName(image.costumeId);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => !o && close()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col outline-none data-[state=open]:animate-in data-[state=open]:fade-in"
          aria-describedby={undefined}
        >
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-sm font-medium text-white">
                {image.filename}
              </DialogPrimitive.Title>
              <p className="flex items-center gap-2 text-[11px] text-white/60">
                <span>
                  {image.width ?? "?"}×{image.height ?? "?"}
                </span>
                <span>·</span>
                <span>{image.status}</span>
                {costume && (
                  <Badge variant="default" className="ml-1">
                    {costume}
                  </Badge>
                )}
              </p>
            </div>
            <span className="text-xs tabular-nums text-white/50">
              {index + 1} / {images.length}
            </span>
            <DialogPrimitive.Close
              className="rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close preview"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6"
            onClick={(e) => e.target === e.currentTarget && close()}
          >
            {isLoading && (
              <Loader2 className="size-8 animate-spin text-white/50" />
            )}
            {isError && (
              <p className="text-sm text-white/60">Could not load image.</p>
            )}
            {src && (
              <img
                src={src}
                alt={image.filename}
                className="max-h-full max-w-full object-contain select-none"
                draggable={false}
              />
            )}

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={() => step(-1)}
                  className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={() => step(1)}
                  className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
