import { useQuery } from "@tanstack/react-query";
import { tauri } from "@/lib/tauri";
import { pLimit } from "@/lib/concurrency";

// At most 4 thumbnails decoding (in Rust) at a time — avoids a burst of
// spawn_blocking jobs when many cells mount/scroll into view.
const limit = pLimit(4);

// The full-screen preview decodes one big image at a time.
const largeLimit = pLimit(2);

/** Base64 JPEG thumbnail (generated in Rust). Cached forever — image
 *  files don't change under us during a session. */
export function useThumbnail(filepath: string) {
  return useQuery<string>({
    queryKey: ["thumbnail", filepath],
    queryFn: () => limit(() => tauri.getImageThumbnail(filepath, 220)),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });
}

/** High-resolution render for the full-screen preview. `thumbnail` only
 *  downscales, so a large `max` yields the image at (near) full size,
 *  capped on the longest edge. Only fetched while the lightbox is open. */
export function useLargeImage(filepath: string | null) {
  return useQuery<string>({
    queryKey: ["large-image", filepath],
    queryFn: () => largeLimit(() => tauri.getImageThumbnail(filepath!, 2048)),
    enabled: filepath != null,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });
}
