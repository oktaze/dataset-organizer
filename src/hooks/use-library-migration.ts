import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tauri } from "@/lib/tauri";

/** One-time backfill: copy images that were imported the *old* way (an
 *  external path stored directly in `filepath`) into the app-managed
 *  library, so the dataset survives the source folder being deleted.
 *
 *  Legacy rows are exactly those with `source_path IS NULL` (the v2 schema
 *  default) — this is self-clearing, needs no extra flag, and is resumable
 *  across restarts. Originals that have since disappeared are recorded as
 *  `failed` and marked (source_path set) so they are never retried. */

export type MigrationStatus = "idle" | "running" | "done";

export interface MigrationState {
  status: MigrationStatus;
  done: number;
  total: number;
  /** Originals that could not be copied (missing/unreadable). */
  failed: number;
}

interface LegacyRow {
  id: string;
  project_id: string;
  filepath: string;
}

/** Run only once even if the hook mounts twice (StrictMode / remounts). */
let started = false;

export function useLibraryMigration(): MigrationState {
  const qc = useQueryClient();
  const [state, setState] = useState<MigrationState>({
    status: "idle",
    done: 0,
    total: 0,
    failed: 0,
  });

  useEffect(() => {
    if (started) return;
    started = true;

    let cancelled = false;

    void (async () => {
      let rows: LegacyRow[];
      try {
        rows = await tauri.dbQuery<LegacyRow>(
          "SELECT id, project_id, filepath FROM images WHERE source_path IS NULL",
          [],
        );
      } catch {
        // No Tauri context (web dev) / transient: stay silent.
        return;
      }
      if (cancelled || rows.length === 0) return;

      setState({
        status: "running",
        done: 0,
        total: rows.length,
        failed: 0,
      });

      let failed = 0;
      for (const r of rows) {
        try {
          const managed = await tauri.importIntoLibrary(
            r.project_id,
            r.id,
            r.filepath,
          );
          await tauri.dbExecute(
            "UPDATE images SET filepath = ?, source_path = ? WHERE id = ?",
            [managed, r.filepath, r.id],
          );
        } catch {
          // Original gone/unreadable: mark it so it isn't retried next
          // launch. The row stays broken exactly as it already was.
          failed += 1;
          await tauri.dbExecute(
            "UPDATE images SET source_path = ? WHERE id = ?",
            [r.filepath, r.id],
          );
        }
        if (cancelled) return;
        setState((s) => ({ ...s, done: s.done + 1, failed }));
      }

      setState((s) => ({ ...s, status: "done" }));
      // Migrated rows changed filepath → refresh any open gallery.
      qc.invalidateQueries({ queryKey: ["images"] });
    })();

    return () => {
      cancelled = true;
    };
  }, [qc]);

  return state;
}
