import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface MentionPerson {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Textarea that pops up a list of everyone on the system when the user types "@".
 */
export function MentionTextarea({
  value,
  onChange,
  people,
  placeholder,
  rows = 3,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  people: MentionPerson[];
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [start, setStart] = React.useState(0);
  const [active, setActive] = React.useState(0);

  const label = (p: MentionPerson) => p.full_name ?? p.email;

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? people.filter(
          (p) => label(p).toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
        )
      : people;
    return list.slice(0, 8);
  }, [people, query]);

  const sync = (text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return setOpen(false);
    const before = at === 0 ? " " : upto[at - 1]!;
    const token = upto.slice(at + 1);
    if (!/\s/.test(before) || /\n/.test(token) || token.length > 30) return setOpen(false);
    setStart(at);
    setQuery(token);
    setActive(0);
    setOpen(true);
  };

  const pick = (p: MentionPerson) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, start)}@${label(p)} ${value.slice(caret)}`;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = start + label(p).length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(matches[active]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Textarea
        ref={ref}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          sync(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onClick={(e) => sync(value, e.currentTarget.selectionStart ?? 0)}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 bottom-full mb-1 left-0 w-72 rounded-md border bg-popover shadow-md overflow-hidden">
          <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground border-b">
            Mention someone
          </p>
          <ul className="max-h-56 overflow-y-auto py-1">
            {matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm flex flex-col",
                    i === active && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="font-medium">{label(p)}</span>
                  <span className="text-[11px] text-muted-foreground">{p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
