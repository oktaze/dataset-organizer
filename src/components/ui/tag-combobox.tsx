import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { ciKey } from "@/lib/tag-key";
import type { VocabEntry } from "@/hooks/use-project-vocabulary";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 8;

function useFiltered(
  suggestions: VocabEntry[],
  draft: string,
  exclude: string[],
): VocabEntry[] {
  return useMemo(() => {
    const skip = new Set(exclude.map(ciKey));
    const q = ciKey(draft);
    const pool = suggestions.filter((s) => !skip.has(ciKey(s.tag)));
    const matched = q === "" ? pool : pool.filter((s) => ciKey(s.tag).includes(q));
    // Exact-typed value should never be offered as its own suggestion.
    return matched
      .filter((s) => ciKey(s.tag) !== q)
      .slice(0, MAX_SUGGESTIONS);
  }, [suggestions, draft, exclude]);
}

interface TagComboboxInputProps {
  suggestions: VocabEntry[];
  onCommit: (tag: string) => void;
  /** Tags already chosen elsewhere — hidden from the dropdown. */
  exclude?: string[];
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Backspace on an empty field (used by the chips wrapper to pop the last). */
  onBackspaceEmpty?: () => void;
}

/** Bare autocomplete input: a text field with a floating suggestion list.
 *  Commits a tag on Enter, comma, or clicking a suggestion; ↑/↓ navigate,
 *  Esc closes. Renders no chips — the caller owns whatever it commits. */
export function TagComboboxInput({
  suggestions,
  onCommit,
  exclude = [],
  placeholder = "Add tag…",
  autoFocus,
  className,
  onBackspaceEmpty,
}: TagComboboxInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const filtered = useFiltered(suggestions, draft, exclude);

  function commit(raw: string) {
    const tag = raw.trim().replace(/,$/, "").trim();
    setDraft("");
    setHighlight(-1);
    setOpen(false);
    if (tag === "") return;
    onCommit(tag);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlight >= 0 && filtered[highlight]) {
        commit(filtered[highlight].tag);
      } else {
        commit(draft);
      }
    } else if (e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlight(-1);
      }
    } else if (
      e.key === "Backspace" &&
      draft === "" &&
      onBackspaceEmpty
    ) {
      onBackspaceEmpty();
    }
  }

  return (
    <div className="relative min-w-24 flex-1">
      <input
        value={draft}
        autoFocus={autoFocus}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => commit(draft)}
        placeholder={placeholder}
        className={cn(
          "h-6 w-full bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground",
          className,
        )}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute top-full left-0 z-30 mt-1 max-h-60 w-56 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg">
          {filtered.map((s, i) => (
            <li key={s.tag}>
              <button
                type="button"
                // Keep focus on the input so blur doesn't fire before the click.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(s.tag)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs",
                  i === highlight
                    ? "bg-primary/15 text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <span className="truncate">{s.tag}</span>
                {s.count > 0 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {s.count}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TagComboboxProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: VocabEntry[];
  placeholder?: string;
  chipClassName?: string;
  autoFocus?: boolean;
}

/** Chips input with autocomplete: like `TagInput` but backed by a project
 *  vocabulary dropdown. Enter/comma/click commits, Backspace on an empty
 *  field removes the last chip, duplicates are ignored (case-insensitive). */
export function TagCombobox({
  value,
  onChange,
  suggestions,
  placeholder = "Add tag…",
  chipClassName,
  autoFocus,
}: TagComboboxProps) {
  const inputWrap = useRef<HTMLDivElement>(null);

  function add(tag: string) {
    if (value.some((v) => ciKey(v) === ciKey(tag))) return;
    onChange([...value, tag]);
  }

  return (
    <div
      className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input bg-input/30 px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40"
      onClick={() => inputWrap.current?.querySelector("input")?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className={cn(
            "inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary",
            chipClassName,
          )}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((t) => t !== tag));
            }}
            className="text-current/70 hover:text-current"
            aria-label={`Remove ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <div ref={inputWrap} className="flex min-w-24 flex-1">
        <TagComboboxInput
          suggestions={suggestions}
          onCommit={add}
          exclude={value}
          placeholder={value.length === 0 ? placeholder : ""}
          autoFocus={autoFocus}
          onBackspaceEmpty={() =>
            value.length > 0 && onChange(value.slice(0, -1))
          }
        />
      </div>
    </div>
  );
}
