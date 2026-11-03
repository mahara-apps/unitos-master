import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeRename } from "@/lib/inline-rename";

/**
 * Nome editável no próprio lugar: clique para editar, Enter salva, Esc cancela.
 * Sem `onSave` vira texto simples (quem não pode editar só lê).
 */
export function InlineEditableText({
  value,
  onSave,
  maxLength = 200,
  className,
  inputClassName,
  ariaLabel = "Renomear",
}: {
  value: string;
  onSave?: (next: string) => void | Promise<unknown>;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!onSave) return <span className={className}>{value}</span>;

  const commit = () => {
    const next = normalizeRename(draft, value, maxLength);
    setEditing(false);
    if (next !== null) void onSave(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={maxLength}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={commit}
        className={cn(
          "w-full min-w-0 rounded-md border border-input bg-background px-2 py-0.5 outline-none focus:ring-2 focus:ring-ring",
          inputClassName ?? className,
        )}
      />
    );
  }

  return (
    <span className="group/rename inline-flex min-w-0 max-w-full items-center gap-1.5">
      <span className={cn("min-w-0", className)}>{value}</span>
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover/rename:opacity-100"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </span>
  );
}
