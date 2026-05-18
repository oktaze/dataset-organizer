import { useEffect, useRef } from "react";
import type { Costume, ImageItem, ImageStatus } from "@/lib/types";

interface ShortcutContext {
  enabled: boolean;
  isCharacter: boolean;
  images: ImageItem[];
  costumes: Costume[];
  selectedImageId: string | null;
  selectImage: (id: string) => void;
  patchImage: (
    id: string,
    patch: { costumeId?: string | null; status?: ImageStatus },
  ) => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/** Gallery keyboard shortcuts (CLAUDE.md): A/D navigate, 1-9 assign
 *  costume, V validate. Bound once; reads latest state via a ref. */
export function useKeyboardShortcuts(ctx: ShortcutContext) {
  const ref = useRef(ctx);
  ref.current = ctx;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const c = ref.current;
      if (!c.enabled || isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const { images, selectedImageId } = c;
      const idx = images.findIndex((i) => i.id === selectedImageId);
      const key = e.key.toLowerCase();

      if (key === "a" || e.key === "ArrowLeft") {
        if (images.length === 0) return;
        e.preventDefault();
        const next = idx <= 0 ? images.length - 1 : idx - 1;
        c.selectImage(images[next].id);
      } else if (key === "d" || e.key === "ArrowRight") {
        if (images.length === 0) return;
        e.preventDefault();
        const next = idx < 0 || idx >= images.length - 1 ? 0 : idx + 1;
        c.selectImage(images[next].id);
      } else if (key === "v") {
        if (idx < 0) return;
        e.preventDefault();
        const img = images[idx];
        c.patchImage(img.id, {
          status: img.status === "validated" ? "tagged" : "validated",
        });
      } else if (/^[1-9]$/.test(e.key)) {
        if (idx < 0 || !c.isCharacter) return;
        const costume = c.costumes[Number(e.key) - 1];
        if (!costume) return;
        e.preventDefault();
        c.patchImage(images[idx].id, { costumeId: costume.id });
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
