import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { costumesDb, type NewCostume } from "@/lib/db";
import type { Costume } from "@/lib/types";

const key = (projectId: string) => ["costumes", projectId];

export function useCostumes(projectId: string | null) {
  return useQuery<Costume[]>({
    queryKey: key(projectId ?? ""),
    queryFn: () => costumesDb.list(projectId as string),
    enabled: projectId != null,
  });
}

export function useCreateCostume(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewCostume) => costumesDb.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useUpdateCostume(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      patch: Partial<
        Pick<Costume, "name" | "trigger" | "tags" | "colorTags" | "sortOrder">
      >;
    }) => costumesDb.update(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useDeleteCostume(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => costumesDb.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}
