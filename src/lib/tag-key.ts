/** Case-insensitive tag key + de-dup, shared by the tagging pipeline, bulk
 *  tag editing and dataset stats so the normalization never drifts (mirrors
 *  the single-source approach of `sidecar/tag_format.py`). */

export const ciKey = (s: string): string => s.trim().toLowerCase();

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
