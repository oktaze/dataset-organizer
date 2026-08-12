/** Tag curation: strip every blacklisted tag from a tag list. Pure and
 *  side-effect free so it can be unit-tested and reused by the DB layer.
 *  Matching is case-insensitive and underscore ↔ space insensitive via
 *  `blacklistKey` (kaomoji preserved). Original order is preserved. */

import { blacklistKey } from "@/lib/tag-key";

export function curateTags(
  tagsFinal: string[],
  blacklist: string[],
): string[] {
  const keys = new Set(
    blacklist.map(blacklistKey).filter((k) => k !== ""),
  );
  if (keys.size === 0) return tagsFinal;
  return tagsFinal.filter((t) => !keys.has(blacklistKey(t)));
}
