import { useState } from "react";
import { X } from "lucide-react";
import { useLibraryMigration } from "@/hooks/use-library-migration";

/**
 * Bottom-right notice (same chrome as {@link UpdateBanner}) shown only when
 * legacy externally-referenced images are being copied into the app-managed
 * library on launch. Hidden entirely when there is nothing to migrate.
 */
export function LibraryMigrationBanner() {
  const { status, done, total, failed } = useLibraryMigration();
  const [dismissed, setDismissed] = useState(false);

  if (status === "idle" || total === 0) return null;
  if (status === "done" && dismissed) return null;

  const percent = total > 0 ? Math.min(100, (done / total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
      {status === "running" ? (
        <>
          <div className="flex items-center justify-between text-xs text-foreground">
            <span>Securing image library…</span>
            <span className="text-muted-foreground">
              {done}/{total}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Image library updated
            </p>
            <p className="text-xs text-muted-foreground">
              {total - failed} image{total - failed === 1 ? "" : "s"} copied
              into app storage.
              {failed > 0 &&
                ` ${failed} original${failed === 1 ? "" : "s"} were missing and could not be recovered.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
