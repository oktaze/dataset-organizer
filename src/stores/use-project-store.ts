import { create } from "zustand";

/** UI selection state. The project list itself is server/DB state and
 *  lives in TanStack Query (`useProjects`), not here. */
interface ProjectState {
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  activeProjectId: null,
  setActiveProject: (activeProjectId) => set({ activeProjectId }),
}));
