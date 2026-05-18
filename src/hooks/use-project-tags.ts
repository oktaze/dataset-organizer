import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { projectTagsDb } from "@/lib/db";
import type { ProjectTag } from "@/lib/types";

const key = (projectId: string) => ["project-tags", projectId];

export function useProjectTags(projectId: string | null) {
  return useQuery<ProjectTag[]>({
    queryKey: key(projectId ?? ""),
    queryFn: () => projectTagsDb.list(projectId as string),
    enabled: projectId != null,
  });
}

export function useAddProjectTag(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tag: string) => projectTagsDb.add(projectId, tag),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useRemoveProjectTag(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectTagsDb.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}
