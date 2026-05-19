import { create } from "zustand";

export type CenterView = "gallery" | "costumes" | "setup" | "stats";

interface UiState {
  view: CenterView;
  /** Focused image (drives the tag editor). */
  selectedImageId: string | null;
  /** Full-screen preview open for the focused image. */
  lightboxOpen: boolean;
  /** Bulk-review multi-selection. */
  bulkIds: string[];
  /** When on, gallery checkboxes are always shown and a plain click on an
   *  image toggles its selection instead of focusing the tag editor. */
  selectMode: boolean;
  /** Keyboard-shortcuts help overlay. */
  helpOpen: boolean;
  /** Gallery costume filter: "all" | "none" | costumeId. Lifted here so the
   *  by-costume overview can drill into the gallery pre-filtered. */
  costumeFilter: string;
  setView: (view: CenterView) => void;
  setCostumeFilter: (id: string) => void;
  setSelectedImage: (id: string | null) => void;
  openLightbox: (id: string) => void;
  closeLightbox: () => void;
  setBulk: (ids: string[]) => void;
  toggleBulk: (id: string) => void;
  clearBulk: () => void;
  setSelectMode: (on: boolean) => void;
  setHelpOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "gallery",
  selectedImageId: null,
  lightboxOpen: false,
  bulkIds: [],
  selectMode: false,
  helpOpen: false,
  costumeFilter: "all",
  setView: (view) => set({ view }),
  setCostumeFilter: (costumeFilter) => set({ costumeFilter }),
  setSelectedImage: (selectedImageId) => set({ selectedImageId }),
  openLightbox: (id) => set({ selectedImageId: id, lightboxOpen: true }),
  closeLightbox: () => set({ lightboxOpen: false }),
  setBulk: (bulkIds) => set({ bulkIds }),
  toggleBulk: (id) =>
    set((s) => ({
      bulkIds: s.bulkIds.includes(id)
        ? s.bulkIds.filter((x) => x !== id)
        : [...s.bulkIds, id],
    })),
  clearBulk: () => set({ bulkIds: [] }),
  setSelectMode: (selectMode) => set({ selectMode }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));
