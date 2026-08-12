/** Shared tagging pipeline (WD Tagger -> costume match -> caption),
 *  used by both folder import and re-processing existing images. */

import { sidecar, type CostumeMatchInput } from "@/lib/sidecar";
import {
  costumesDb,
  constantTagsDb,
  projectTagsDb,
  type ImagePatch,
} from "@/lib/db";
import {
  getThreshold,
  getMaxTags,
  getBlacklist,
  getPrependTags,
  getAppendTags,
  getExistingPolicy,
  type ExistingPolicy,
} from "@/stores/use-settings-store";
import { ciKey, dedupeNames } from "@/lib/tag-key";
import type { Costume, ImageItem, Project, TagScore } from "@/lib/types";

export interface PipelineCtx {
  project: Project;
  isCharacter: boolean;
  matchInput: CostumeMatchInput[];
  costumeById: Map<string, Costume>;
  /** Excluded tags (learned implicitly) — all project types. */
  constants: string[];
  /** Style/Concept: forced tags added to every caption (non-character). */
  projectTags: string[];
  threshold: number;
  maxTags: number;
  blacklist: string[];
  prependTags: string[];
  appendTags: string[];
  existingPolicy: ExistingPolicy;
}

/** Build the context once, then reuse it across many images. */
export async function makePipelineCtx(project: Project): Promise<PipelineCtx> {
  const isCharacter = project.type === "character";
  const costumes = isCharacter ? await costumesDb.list(project.id) : [];
  const constants = (await constantTagsDb.list(project.id)).map((c) => c.tag);
  const projectTags = isCharacter
    ? []
    : (await projectTagsDb.list(project.id)).map((t) => t.tag);
  return {
    project,
    isCharacter,
    matchInput: costumes.map((c) => ({
      id: c.id,
      name: c.name,
      tags: c.tags,
      color_tags: c.colorTags,
    })),
    costumeById: new Map(costumes.map((c) => [c.id, c])),
    constants,
    projectTags,
    threshold: getThreshold(project.id),
    maxTags: getMaxTags(project.id),
    blacklist: getBlacklist(project.id),
    prependTags: getPrependTags(project.id),
    appendTags: getAppendTags(project.id),
    existingPolicy: getExistingPolicy(project.id),
  };
}

/** Union of TagScore lists; existing entries win on collision. */
function unionTagScores(existing: TagScore[], fresh: TagScore[]): TagScore[] {
  const seen = new Set(existing.map((t) => ciKey(t.tag)));
  const out = [...existing];
  for (const t of fresh) {
    const k = ciKey(t.tag);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Run the full pipeline for one image and return the DB patch.
 *  Returns an empty patch (no-op for imagesDb.update) when the image is
 *  skipped under the "ignore" existing-tags policy. */
export async function processImage(
  img: ImageItem,
  ctx: PipelineCtx,
): Promise<ImagePatch> {
  const hasTags = img.status !== "pending" || img.tagsFinal.length > 0;

  // "ignore": leave already-tagged images untouched.
  if (ctx.existingPolicy === "ignore" && hasTags) return {};

  const { tags } = await sidecar.tagOne(img.filepath, {
    threshold: ctx.threshold,
    maxTags: ctx.maxTags,
    blacklist: ctx.blacklist,
  });

  // "append": merge fresh tags into the existing set (case-insensitive).
  const isAppend = ctx.existingPolicy === "append" && hasTags;
  const finalAuto = isAppend ? unionTagScores(img.tagsAuto, tags) : tags;
  const autoNames = isAppend
    ? dedupeNames([...img.tagsFinal, ...tags.map((t) => t.tag)])
    : tags.map((t) => t.tag);

  let costumeId: string | null = null;
  let costumeScore: Record<string, number> = {};
  let costumeTags: string[] | undefined;
  let costumeTrigger: string | undefined;

  if (ctx.isCharacter) {
    if (ctx.matchInput.length > 0) {
      const m = await sidecar.matchCostume(
        img.filepath,
        ctx.matchInput,
        ctx.threshold,
      );
      costumeScore = m.scores;
      costumeId = m.best_costume_id;
      const c = costumeId ? ctx.costumeById.get(costumeId) : undefined;
      if (c) {
        const merged = [...c.tags, ...c.colorTags];
        costumeTags = merged.length > 0 ? merged : undefined;
        costumeTrigger = c.trigger ?? undefined;
      }
    }
  } else if (ctx.projectTags.length > 0) {
    // Style/Concept: always-include tags, no costume matching.
    costumeTags = ctx.projectTags;
  }

  const { caption } = await sidecar.buildCaption({
    trigger: ctx.project.trigger,
    auto_tags: autoNames,
    constant_tags: ctx.constants,
    costume_tags: costumeTags,
    costume_trigger: costumeTrigger,
    prepend_tags: ctx.prependTags,
    append_tags: ctx.appendTags,
  });

  return {
    tagsAuto: finalAuto,
    tagsFinal: autoNames,
    costumeId,
    costumeScore,
    caption,
    status: "tagged",
  };
}

/** Build a caption from tags already known for an image (e.g. imported from
 *  a Grabber `.txt`) — no WD Tagger inference. Costume matching scores
 *  against the supplied tags. `tags` is expected pre-parsed/deduped/filtered
 *  by the caller. Requires the sidecar to be reachable (caption + match). */
export async function processImageFromTags(
  filepath: string,
  ctx: PipelineCtx,
  tags: string[],
): Promise<ImagePatch> {
  let costumeId: string | null = null;
  let costumeScore: Record<string, number> = {};
  let costumeTags: string[] | undefined;
  let costumeTrigger: string | undefined;

  if (ctx.isCharacter) {
    if (ctx.matchInput.length > 0) {
      const m = await sidecar.matchCostume(
        filepath,
        ctx.matchInput,
        ctx.threshold,
        tags,
      );
      costumeScore = m.scores;
      costumeId = m.best_costume_id;
      const c = costumeId ? ctx.costumeById.get(costumeId) : undefined;
      if (c) {
        const merged = [...c.tags, ...c.colorTags];
        costumeTags = merged.length > 0 ? merged : undefined;
        costumeTrigger = c.trigger ?? undefined;
      }
    }
  } else if (ctx.projectTags.length > 0) {
    // Style/Concept: always-include tags, no costume matching.
    costumeTags = ctx.projectTags;
  }

  const { caption } = await sidecar.buildCaption({
    trigger: ctx.project.trigger,
    auto_tags: tags,
    constant_tags: ctx.constants,
    costume_tags: costumeTags,
    costume_trigger: costumeTrigger,
    prepend_tags: ctx.prependTags,
    append_tags: ctx.appendTags,
  });

  return {
    tagsAuto: tags.map((tag) => ({ tag, score: 1 })),
    tagsFinal: tags,
    costumeId,
    costumeScore,
    caption,
    status: "tagged",
  };
}
