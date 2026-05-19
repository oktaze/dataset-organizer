import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { projectsDb, type NewProject } from "@/lib/db";
import { tauri } from "@/lib/tauri";
import type { Project } from "@/lib/types";

const KEY = ["projects"];

export function useProjects() {
  return useQuery<Project[]>({ queryKey: KEY, queryFn: projectsDb.list });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProject) => projectsDb.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      patch: Partial<Pick<Project, "name" | "trigger" | "baseModel">>;
    }) => projectsDb.update(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // DB rows cascade-delete; then purge the project's managed image
      // library. Best-effort: a file error must not fail the deletion.
      await projectsDb.remove(id);
      try {
        await tauri.removeLibraryProject(id);
      } catch {
        /* leave orphaned files rather than block project deletion */
      }
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
