import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { imagesDb, costumesDb, type ImagePatch } from "@/lib/db";
import { makePipelineCtx } from "@/lib/pipeline";
import { sidecar } from "@/lib/sidecar";
import { pLimit } from "@/lib/concurrency";
import { useUndoStore } from "@/stores/use-undo-store";
import type { ImageItem, ImageStatus, Project } from "@/lib/types";

const key = (projectId: string) => ["images", projectId];

/** Human-readable undo label for a bulk tag add/remove batch. */
function tagBatchLabel(
  verb: "Added" | "Removed",
  tags: string[],
  count: number,
): string {
  const what =
    tags.length === 1
      ? `“${tags[0]}”`
      : `${tags.length} tags`;
  const prep = verb === "Added" ? "to" : "from";
  return `${verb} ${what} ${prep} ${count} image(s)`;
}

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

/** Bulk actions for the review-in-bulk flow. Each op snapshots the prior
 *  state of the touched rows into the undo store first (single-level undo). */
export function useBulkImageActions(project: Project) {
  const qc = useQueryClient();
  const projectId = project.id;
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: key(projectId) });

  const snapshot = (ids: string[], label: string) => {
    const all = qc.getQueryData<ImageItem[]>(key(projectId)) ?? [];
    const sel = new Set(ids);
    useUndoStore.getState().capture({
      projectId,
      label,
      images: all.filter((i) => sel.has(i.id)).map((i) => ({ ...i })),
    });
  };

  const setStatus = useMutation({
    mutationFn: (args: { ids: string[]; status: ImageStatus }) => {
      snapshot(args.ids, `Set ${args.ids.length} image(s) → ${args.status}`);
      return imagesDb.setStatusMany(args.ids, args.status);
    },
    onSuccess: invalidate,
  });

  const setCostume = useMutation({
    mutationFn: (args: { ids: string[]; costumeId: string | null }) => {
      snapshot(args.ids, `Reassigned costume on ${args.ids.length} image(s)`);
      return imagesDb.setCostumeMany(args.ids, args.costumeId);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) => {
      snapshot(ids, `Deleted ${ids.length} image(s)`);
      return imagesDb.removeMany(ids);
    },
    onSuccess: invalidate,
  });

  // Re-assemble captions from the given images' current tags + costume (no WD
  // Tagger run — that's the "Tag images" reprocess flow). Mirrors the
  // single-image rebuild in the tag editor. Reads the freshest tags_final
  // straight from the DB so it stays correct right after a tag add/remove.
  const rebuildInto = async (ids: string[]) => {
    if (ids.length === 0) return;
    const targets = await imagesDb.getMany(ids);
    const ctx = await makePipelineCtx(project);
    const limit = pLimit(4);
    await Promise.all(
      targets.map((img) =>
        limit(async () => {
          let costumeTags: string[] | undefined;
          let costumeTrigger: string | undefined;
          if (ctx.isCharacter) {
            const c = img.costumeId
              ? ctx.costumeById.get(img.costumeId)
              : undefined;
            if (c) {
              const merged = [...c.tags, ...c.colorTags];
              costumeTags = merged.length > 0 ? merged : undefined;
              costumeTrigger = c.trigger ?? undefined;
            }
          } else if (ctx.projectTags.length > 0) {
            costumeTags = ctx.projectTags;
          }
          const { caption } = await sidecar.buildCaption({
            trigger: ctx.project.trigger,
            auto_tags: img.tagsFinal,
            constant_tags: ctx.constants,
            costume_tags: costumeTags,
            costume_trigger: costumeTrigger,
            prepend_tags: ctx.prependTags,
            append_tags: ctx.appendTags,
          });
          await imagesDb.update(img.id, { caption });
        }),
      ),
    );
  };

  // Adding/removing a tag in bulk rewrites tags_final, which would leave the
  // captions stale — so we rebuild them in the same mutation. The single
  // snapshot taken up front captures both tags_final and caption, so Undo
  // restores the pre-edit state in one step.
  const addTag = useMutation({
    mutationFn: async (args: {
      ids: string[];
      tags: string[];
      position?: number;
    }) => {
      snapshot(args.ids, tagBatchLabel("Added", args.tags, args.ids.length));
      await imagesDb.addTagMany(args.ids, args.tags, args.position);
      await rebuildInto(args.ids);
    },
    onSuccess: invalidate,
  });

  const removeTag = useMutation({
    mutationFn: async (args: { ids: string[]; tags: string[] }) => {
      snapshot(
        args.ids,
        tagBatchLabel("Removed", args.tags, args.ids.length),
      );
      await imagesDb.removeTagMany(args.ids, args.tags);
      await rebuildInto(args.ids);
    },
    onSuccess: invalidate,
  });

  const rebuildCaptions = useMutation({
    mutationFn: async (ids: string[]) => {
      snapshot(ids, `Rebuilt captions for ${ids.length} image(s)`);
      await rebuildInto(ids);
    },
    onSuccess: invalidate,
  });

  return {
    setStatus,
    setCostume,
    remove,
    addTag,
    removeTag,
    rebuildCaptions,
  };
}

/** Single-level undo of the last bulk op. Restores the snapshotted rows
 *  (re-inserting deleted ones); a costume deleted meanwhile is dropped to
 *  avoid an FK failure. */
export function useUndo(project: Project) {
  const qc = useQueryClient();
  const snapshot = useUndoStore((s) => s.snapshot);
  const clearSnap = useUndoStore((s) => s.clear);
  const active =
    snapshot && snapshot.projectId === project.id ? snapshot : null;

  const undo = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const costumes = await costumesDb.list(project.id);
      const valid = new Set(costumes.map((c) => c.id));
      const rows = active.images.map((i) =>
        i.costumeId && !valid.has(i.costumeId)
          ? { ...i, costumeId: null }
          : i,
      );
      await imagesDb.insertRestore(rows);
    },
    onSuccess: () => {
      clearSnap();
      qc.invalidateQueries({ queryKey: key(project.id) });
    },
  });

  return {
    label: active?.label ?? null,
    hasUndo: active != null,
    undo,
    dismiss: clearSnap,
  };
}
