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
  getClaudeVision,
  getAnthropicApiKey,
  getClaudeModel,
} from "@/stores/use-settings-store";
import type { Costume, ImageItem, Project } from "@/lib/types";

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
  useClaude: boolean;
  apiKey: string;
  model: string;
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
    useClaude: getClaudeVision(project.id),
    apiKey: getAnthropicApiKey(),
    model: getClaudeModel(),
  };
}

/** Run the full pipeline for one image and return the DB patch. */
export async function processImage(
  img: ImageItem,
  ctx: PipelineCtx,
): Promise<ImagePatch> {
  const { tags } = await sidecar.tagOne(img.filepath, ctx.threshold);
  const autoNames = tags.map((t) => t.tag);

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
        ctx.useClaude,
        ctx.apiKey,
        ctx.model,
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
  });

  return {
    tagsAuto: tags,
    tagsFinal: autoNames,
    costumeId,
    costumeScore,
    caption,
    status: "tagged",
  };
}
