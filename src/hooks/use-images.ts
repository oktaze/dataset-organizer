import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { imagesDb, type ImagePatch } from "@/lib/db";
import type { ImageItem, ImageStatus } from "@/lib/types";

const key = (projectId: string) => ["images", projectId];

export function useImages(projectId: string | null) {
  return useQuery<ImageItem[]>({
    queryKey: key(projectId ?? ""),
    queryFn: () => imagesDb.list(projectId as string),
    enabled: projectId != null,
  });
}

export function useUpdateImage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: ImagePatch }) =>
      imagesDb.update(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

export function useDeleteImage(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => imagesDb.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  });
}

/** Bulk actions for the review-in-bulk flow. */
export function useBulkImageActions(projectId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: key(projectId) });

  const setStatus = useMutation({
    mutationFn: (args: { ids: string[]; status: ImageStatus }) =>
      imagesDb.setStatusMany(args.ids, args.status),
    onSuccess: invalidate,
  });

  const setCostume = useMutation({
    mutationFn: (args: { ids: string[]; costumeId: string | null }) =>
      imagesDb.setCostumeMany(args.ids, args.costumeId),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) => imagesDb.removeMany(ids),
    onSuccess: invalidate,
  });

  return { setStatus, setCostume, remove };
}
