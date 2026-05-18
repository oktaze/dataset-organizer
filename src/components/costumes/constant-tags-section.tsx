import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  useConstantTags,
  useAddConstantTag,
  useRemoveConstantTag,
} from "@/hooks/use-constant-tags";

interface ConstantTagsSectionProps {
  projectId: string;
}

/** Character constant tags — learned implicitly by the LoRA, so they are
 *  excluded from every caption. */
export function ConstantTagsSection({ projectId }: ConstantTagsSectionProps) {
  const { data: tags = [] } = useConstantTags(projectId);
  const add = useAddConstantTag(projectId);
  const remove = useRemoveConstantTag(projectId);
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
        Constant tags · excluded from all captions (learned implicitly)
      </Label>
      <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-input/30 px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {t.tag}
            <button
              type="button"
              onClick={() => remove.mutate(t.id)}
              className="hover:text-foreground"
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
          placeholder={tags.length === 0 ? "silver_hair, blue_eyes…" : ""}
          className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
