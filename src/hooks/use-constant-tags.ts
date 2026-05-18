import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { constantTagsDb } from "@/lib/db";
import type { ConstantTag } from "@/lib/types";

const key = (projectId: string) => ["constant-tags", projectId];

export function useConstantTags(projectId: string | null) {
  return useQuery<ConstantTag[]>({
    queryKey: key(projectId ?? ""),
    queryFn: () => constantTagsDb.list(projectId as string),
    enabled: projectId != null,
  });
}

export function useAddConstantTag(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tag: string) => constantTagsDb.add(projectId, tag),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useRemoveConstantTag(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => constantTagsDb.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}
