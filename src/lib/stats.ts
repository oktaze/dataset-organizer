/** Pure dataset statistics (no React) — easy to unit-test and shared by the
 *  stats panel. Tag counting reuses the canonical case-insensitive key so
 *  it never drifts from the tagging pipeline. */

import { ciKey } from "@/lib/tag-key";
import type { Costume, ImageItem, ImageStatus } from "@/lib/types";

export const STATUS_ORDER: ImageStatus[] = [
  "pending",
  "tagged",
  "validated",
  "exported",
];

export function countByStatus(
  images: ImageItem[],
): Record<ImageStatus, number> {
  const out: Record<ImageStatus, number> = {
    pending: 0,
    tagged: 0,
    validated: 0,
    exported: 0,
  };
  for (const i of images) out[i.status] += 1;
  return out;
}

export interface CostumeCount {
  /** Costume id, or null for the "no costume" bucket. */
  id: string | null;
  name: string;
  count: number;
}

export function countByCostume(
  images: ImageItem[],
  costumes: Costume[],
): CostumeCount[] {
  const known = new Set(costumes.map((c) => c.id));
  const counts = new Map<string | null, number>();
  for (const i of images) {
    const k = i.costumeId && known.has(i.costumeId) ? i.costumeId : null;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: CostumeCount[] = costumes.map((c) => ({
    id: c.id,
    name: c.name,
    count: counts.get(c.id) ?? 0,
  }));
  const none = counts.get(null) ?? 0;
  if (none > 0) out.push({ id: null, name: "— no costume —", count: none });
  return out.sort((a, b) => b.count - a.count);
}

export interface TagFreq {
  tag: string;
  count: number;
  /** Share of images containing the tag, 0–100. */
  pct: number;
}

export function tagFrequency(images: ImageItem[]): TagFreq[] {
  const counts = new Map<string, { display: string; n: number }>();
  for (const img of images) {
    const seen = new Set<string>();
    for (const t of img.tagsFinal) {
      const k = ciKey(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const e = counts.get(k);
      if (e) e.n += 1;
      else counts.set(k, { display: t, n: 1 });
    }
  }
  const total = images.length || 1;
  return [...counts.values()]
    .map((e) => ({ tag: e.display, count: e.n, pct: (e.n / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

export interface ImbalanceOpts {
  minPerCostume: number;
  tagOverPct: number;
}

const DEFAULT_OPTS: ImbalanceOpts = { minPerCostume: 10, tagOverPct: 80 };

/** Heuristic warnings that hurt LoRA quality: under-filled costumes,
 *  unassigned/untagged images, and tags so common they bleed into the
 *  trigger (better made constant). */
export function imbalanceWarnings(
  images: ImageItem[],
  costumes: Costume[],
  isCharacter: boolean,
  opts: ImbalanceOpts = DEFAULT_OPTS,
): string[] {
  const out: string[] = [];
  const cc = countByCostume(images, costumes);

  if (isCharacter) {
    for (const c of cc) {
      if (c.id != null && c.count < opts.minPerCostume) {
        out.push(
          `Costume “${c.name}” has only ${c.count} image(s) (< ${opts.minPerCostume}).`,
        );
      }
    }
    const none = cc.find((c) => c.id === null);
    if (none) {
      out.push(`${none.count} image(s) have no costume assigned.`);
    }
  }

  const noTags = images.filter((i) => i.tagsFinal.length === 0).length;
  if (noTags > 0) out.push(`${noTags} image(s) have no final tags.`);

  for (const t of tagFrequency(images)) {
    if (t.pct > opts.tagOverPct) {
      out.push(
        `Tag “${t.tag}” is in ${t.pct.toFixed(0)}% of images — consider making it a constant tag.`,
      );
    }
  }
  return out;
}
