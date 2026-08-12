import { useMemo } from "react";
import { useImages } from "@/hooks/use-images";
import { useCostumes } from "@/hooks/use-costumes";
import { useConstantTags } from "@/hooks/use-constant-tags";
import { useProjectTags } from "@/hooks/use-project-tags";
import { ciKey } from "@/lib/tag-key";

export interface VocabEntry {
  tag: string;
  /** How many images carry this tag in `tags_final` (0 for known-but-unused
   *  tags coming from costumes / constants / project-tags only). */
  count: number;
}

/** Derived tag vocabulary for autocomplete / suggestions. Reads the already
 *  cached image + tag queries (no extra network) and returns the union of:
 *  every tag used across `tags_final`, ranked by frequency, plus the project's
 *  "known" tags (costume tags/colors, constant tags, style project-tags) so
 *  the composer suggests canonical names even before they appear on an image.
 *  Case-insensitive de-dup; the first-seen spelling wins. */
export function useProjectVocabulary(projectId: string | null): VocabEntry[] {
  const { data: images = [] } = useImages(projectId);
  const { data: costumes = [] } = useCostumes(projectId);
  const { data: constants = [] } = useConstantTags(projectId);
  const { data: projectTags = [] } = useProjectTags(projectId);

  return useMemo(() => {
    const counts = new Map<string, { tag: string; count: number }>();
    const bump = (raw: string, used: boolean) => {
      const tag = raw.trim();
      if (tag === "") return;
      const k = ciKey(tag);
      const cur = counts.get(k);
      if (cur) {
        if (used) cur.count += 1;
      } else {
        counts.set(k, { tag, count: used ? 1 : 0 });
      }
    };

    for (const img of images) {
      for (const t of img.tagsFinal) bump(t, true);
    }
    for (const c of costumes) {
      for (const t of c.tags) bump(t, false);
      for (const t of c.colorTags) bump(t, false);
    }
    for (const c of constants) bump(c.tag, false);
    for (const p of projectTags) bump(p.tag, false);

    return Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
    );
  }, [images, costumes, constants, projectTags]);
}
