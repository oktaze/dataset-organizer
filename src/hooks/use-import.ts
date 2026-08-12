import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { tauri, type ImageMeta } from "@/lib/tauri";
import { imagesDb } from "@/lib/db";
import { makePipelineCtx, processImageFromTags } from "@/lib/pipeline";
import { ciKey, dedupeNames } from "@/lib/tag-key";
import { useSidecarStore } from "@/stores/use-sidecar-store";
import type { Project } from "@/lib/types";

export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
}

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];

/** Parse a Grabber `.txt` (comma-separated booru tags; newlines tolerated),
 *  de-dup case-insensitively, then drop blacklisted tags. */
function parseGrabberTags(
  text: string | null | undefined,
  blacklist: Set<string>,
): string[] {
  if (!text) return [];
  const raw = text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return dedupeNames(raw).filter((t) => !blacklist.has(ciKey(t)));
}

/**
 * Image import. Two entry points sharing the same de-dup → insert flow:
 * `run` scans a folder, `runFiles` takes hand-picked files (possibly from
 * several folders — call it again to add more). Both insert new images as
 * "pending"; tagging is **not** run here — the user launches it explicitly
 * from the "Tag images" dialog.
 */
export function useImport() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);

  const skippedMsg =
    skipped.length === 0
      ? null
      : `${skipped.length} file${skipped.length === 1 ? "" : "s"} skipped (unreadable / corrupt)`;

  /** De-dup against already-imported paths and insert the fresh ones. */
  async function addMetas(
    project: Project,
    metas: ImageMeta[],
    emptyMsg: string,
    allExistMsg: string,
  ) {
    const existing = await imagesDb.existingPaths(project.id);
    const fresh = metas.filter((m) => !existing.has(m.filepath));

    if (fresh.length === 0) {
      setError(metas.length === 0 ? emptyMsg : allExistMsg);
      return;
    }

    // Only build the (DB-hitting) pipeline context if some image ships tags.
    const anyTags = fresh.some((m) => (m.tagsText ?? "").trim() !== "");
    const ctx = anyTags ? await makePipelineCtx(project) : null;
    const blacklist = new Set(ctx?.blacklist.map(ciKey) ?? []);

    setProgress({ phase: "Copying images", done: 0, total: fresh.length });
    const failed: string[] = [];
    // Images that arrived pre-tagged (Grabber `.txt`) — captioned in a
    // second pass once all files are copied in.
    const tagged: { id: string; filepath: string; tags: string[] }[] = [];
    for (const m of fresh) {
      try {
        // Generate the id first so the managed library file is named after
        // the image row; copy the file in, then store the managed path.
        const id = crypto.randomUUID();
        const managed = await tauri.importIntoLibrary(
          project.id,
          id,
          m.filepath,
        );
        const tags = parseGrabberTags(m.tagsText, blacklist);
        await imagesDb.insert({
          id,
          projectId: project.id,
          filename: m.filename,
          filepath: managed,
          sourcePath: m.filepath,
          width: m.width,
          height: m.height,
          // Persist imported tags up front so they survive even if the
          // caption pass below is skipped (sidecar offline) or fails.
          ...(tags.length > 0
            ? {
                tagsFinal: tags,
                tagsAuto: tags.map((tag) => ({ tag, score: 1 })),
                status: "tagged" as const,
              }
            : {}),
        });
        if (tags.length > 0) tagged.push({ id, filepath: managed, tags });
      } catch {
        // Source vanished / unreadable between scan and copy — skip this
        // one, keep importing the rest.
        failed.push(m.filepath);
      }
      setProgress((p) => p && { ...p, done: p.done + 1 });
    }
    if (failed.length > 0) setSkipped((s) => [...s, ...failed]);

    // Build captions from the imported tags (costume match + caption) when
    // the sidecar is reachable. Non-fatal: tags are already persisted.
    const port = useSidecarStore.getState().port;
    if (ctx && port != null && tagged.length > 0) {
      setProgress({ phase: "Building captions", done: 0, total: tagged.length });
      for (const t of tagged) {
        try {
          const patch = await processImageFromTags(t.filepath, ctx, t.tags);
          await imagesDb.update(t.id, patch);
        } catch {
          // Sidecar hiccup — leave the imported tags as-is.
        }
        setProgress((p) => p && { ...p, done: p.done + 1 });
      }
    }
    qc.invalidateQueries({ queryKey: ["images", project.id] });
  }

  /** Folder import: scan every image in the chosen directory. */
  async function run(project: Project) {
    setError(null);
    setSkipped([]);
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;

    setRunning(true);
    try {
      setProgress({ phase: "Scanning folder", done: 0, total: 0 });
      const { images, skipped: skip } = await tauri.readImagesFromDir(dir);
      setSkipped(skip);
      await addMetas(
        project,
        images,
        "No images found in that folder.",
        "All images already imported.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  /** File import: hand-pick one or more images (re-run to add from other
   *  folders — the OS picker is usually limited to one folder per call). */
  async function runFiles(project: Project) {
    setError(null);
    setSkipped([]);
    const sel = await open({
      multiple: true,
      filters: [{ name: "Images", extensions: IMAGE_EXTS }],
    });
    if (!Array.isArray(sel) || sel.length === 0) return;

    setRunning(true);
    try {
      setProgress({ phase: "Reading files", done: 0, total: 0 });
      const { images, skipped: skip } = await tauri.readImagesMeta(sel);
      setSkipped(skip);
      await addMetas(
        project,
        images,
        "No valid images selected.",
        "All selected images already imported.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return { run, runFiles, running, progress, error, skipped, skippedMsg };
}
