/** Case-insensitive tag key + de-dup, shared by the tagging pipeline, bulk
 *  tag editing and dataset stats so the normalization never drifts (mirrors
 *  the single-source approach of `sidecar/tag_format.py`). */

export const ciKey = (s: string): string => s.trim().toLowerCase();

/** Danbooru emoticon (kaomoji) tags where the underscore is part of the
 *  token, never a word separator — mirrors `sidecar/tag_format.py` KAOMOJI. */
const KAOMOJI = new Set([
  "0_0", "(o)_(o)", "+_+", "+_-", "._.", "<o>_<o>", "<|>_<|>", "=_=",
  ">_<", "3_3", "6_9", ">_o", "@_@", "^_^", "o_o", "u_u", "x_x", "|_|",
  "||_||",
]);

/** Match key for blacklist curation: case-insensitive AND underscore ↔ space
 *  insensitive, so `blue_hair` and `blue hair` collapse to the same key.
 *  Kaomoji keep their underscores. Mirrors `sidecar/tag_format.py
 *  normalize_tag` so the two stay in sync. */
export const blacklistKey = (s: string): string => {
  const t = s.trim();
  if (KAOMOJI.has(t)) return t.toLowerCase();
  return t.replace(/_/g, " ").trim().toLowerCase();
};

/** Case-insensitive de-dup of tag names, first occurrence wins. */
export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = ciKey(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}
