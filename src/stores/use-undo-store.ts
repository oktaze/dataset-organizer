import { create } from "zustand";
import type { ImageItem } from "@/lib/types";

/** Single-level undo: the previous full state of the images touched by the
 *  last bulk/destructive op. A new op overwrites it; switching project or
 *  performing the undo clears it. */
export interface UndoSnapshot {
  projectId: string;
  label: string;
  images: ImageItem[];
}

interface UndoState {
  snapshot: UndoSnapshot | null;
  capture: (snapshot: UndoSnapshot) => void;
  clear: () => void;
}

export const useUndoStore = create<UndoState>((set) => ({
  snapshot: null,
  capture: (snapshot) => set({ snapshot }),
  clear: () => set({ snapshot: null }),
}));
