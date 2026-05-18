import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  useProjectTags,
  useAddProjectTag,
  useRemoveProjectTag,
} from "@/hooks/use-project-tags";

interface AlwaysTagsSectionProps {
  projectId: string;
}

/** Style/Concept: tags appended to every caption right after the trigger
 *  (e.g. medium, artist_style, source). */
export function AlwaysTagsSection({ projectId }: AlwaysTagsSectionProps) {
  const { data: tags = [] } = useProjectTags(projectId);
  const add = useAddProjectTag(projectId);
  const remove = useRemoveProjectTag(projectId);
  const [draft, setDraft] = useState("");

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const tag = draft.trim().replace(/,$/, "").trim();
    if (tag === "" || tags.some((t) => t.tag === tag)) {
      setDraft("");
      return;
    }
    add.mutate(tag);
    setDraft("");
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <Label className="mb-2 block">
        Always-included tags · added to every caption after the trigger
      </Label>
      <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-input/30 px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary"
          >
            {t.tag}
            <button
              type="button"
              onClick={() => remove.mutate(t.id)}
              className="text-current/70 hover:text-current"
              aria-label={`Remove ${t.tag}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            tags.length === 0 ? "oil painting, impressionism, monochrome…" : ""
          }
          className="h-6 min-w-40 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
