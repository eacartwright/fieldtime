import { projectPath, ticketNumber, type Id, type Task } from "@fieldtime/shared";
import { useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useA, useM } from "../model";

// Text fields bound to synced values. They keep a local draft so that
// updates arriving from another device never yank text out from under the cursor.

function useDraft(value: string, el: React.RefObject<HTMLElement | null>, resetKey?: unknown) {
  const [draft, setDraft] = useState(value);
  // When the field switches to a different record (e.g. a new session), reset during
  // render rather than in an effect. Otherwise a keystroke landing between the two
  // would append to the previous record's text.
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setDraft(value);
  }
  useEffect(() => {
    if (document.activeElement !== el.current) setDraft(value);
  }, [value, el]);
  return [draft, setDraft] as const;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValue: (v: string) => void;
  resetKey?: unknown;
};

export function DraftInput({ value, onValue, resetKey, ...rest }: InputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useDraft(value, ref, resetKey);
  return (
    <input
      {...rest}
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onValue(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        rest.onKeyDown?.(e);
      }}
    />
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValue: (v: string) => void;
  resetKey?: unknown;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export function DraftTextarea({ value, onValue, resetKey, textareaRef, ...rest }: TextareaProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? own;
  const [draft, setDraft] = useDraft(value, ref, resetKey);
  return (
    <textarea
      {...rest}
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onValue(e.target.value);
      }}
    />
  );
}

type Option = { key: string; text: string; pick: () => void };

/**
 * A chip that opens a find-or-add list. `options(query)` gives the choices for what's
 * typed so far (lowercased, trimmed).
 */
function ComboPicker({
  chip,
  chipTitle,
  set,
  placeholder,
  options: optionsFor,
}: {
  chip: string;
  /** Tooltip for the chip. */
  chipTitle?: string;
  set: boolean;
  placeholder: string;
  options: (query: string, typed: string) => Option[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const options = optionsFor(q.trim().toLowerCase(), q.trim());

  const close = () => {
    setOpen(false);
    setQ("");
    setSel(0);
  };
  const choose = (i: number) => {
    options[i]?.pick();
    close();
  };

  if (!open) {
    return (
      <button type="button" className={`chip ${set ? "chip-set" : ""}`} title={chipTitle} onClick={() => setOpen(true)}>
        {chip}
      </button>
    );
  }
  return (
    <div
      className="picker"
      ref={box}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <input
        autoFocus
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, options.length - 1));
          else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
          else if (e.key === "Enter") choose(sel);
          else if (e.key === "Escape") close();
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <ul role="listbox">
        {options.map((o, i) => (
          <li key={o.key}>
            <button
              type="button"
              className={i === sel ? "active" : ""}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(i)}
            >
              {o.text}
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="muted pad">Type a name to add one</li>}
      </ul>
    </div>
  );
}

/** Pick a client (group), or type a new name to add one. */
export function GroupPicker({ value, onChange }: { value: Id | null; onChange: (id: Id | null) => void }) {
  const m = useM();
  const a = useA();
  const current = value ? m.view.groups[value] : undefined;
  const label = m.config.groupLabel;
  return (
    <ComboPicker
      chip={current ? current.name : `+ ${label}`}
      set={!!current}
      placeholder={`Find or add ${label.toLowerCase()}…`}
      options={(query, typed) => [
        ...m.groups
          .filter((g) => g.name.toLowerCase().includes(query))
          .slice(0, 8)
          .map((g) => ({ key: g.id, text: g.name, pick: () => onChange(g.id) })),
        ...(query && !m.groups.some((g) => g.name.toLowerCase() === query)
          ? [{ key: "+", text: `Add “${typed}”`, pick: () => onChange(a.createGroup(typed)) }]
          : []),
        ...(value ? [{ key: "-", text: `No ${label.toLowerCase()}`, pick: () => onChange(null) }] : []),
      ]}
    />
  );
}

/**
 * Pick a project, or type a name to add a new top-level one. `exclude` leaves out a
 * project and everything inside it (choosing where a project itself goes).
 */
export function ProjectPicker({
  value,
  onChange,
  none = "No project",
  empty = "+ Project",
  exclude,
}: {
  value: Id | null;
  onChange: (id: Id | null) => void;
  none?: string;
  /** The chip when no project is chosen. */
  empty?: string;
  exclude?: Id;
}) {
  const m = useM();
  const a = useA();
  const current = m.projects.find((p) => p.project.id === value);
  const choices = exclude
    ? m.projects.filter((p) => !projectPath(m.view, p.project.id).some((x) => x.id === exclude))
    : m.projects;
  return (
    <ComboPicker
      chip={current ? current.project.title || "Untitled project" : empty}
      chipTitle={current?.path}
      set={!!current}
      placeholder="Find or add project…"
      options={(query, typed) => [
        ...choices
          .filter((p) => p.path.toLowerCase().includes(query))
          .slice(0, 10)
          .map((p) => ({ key: p.project.id, text: p.path, pick: () => onChange(p.project.id) })),
        ...(query && !m.projects.some((p) => p.project.title.toLowerCase() === query)
          ? [{ key: "+", text: `Add project “${typed}”`, pick: () => onChange(a.createProject(typed, null)) }]
          : []),
        ...(value ? [{ key: "-", text: none, pick: () => onChange(null) }] : []),
      ]}
    />
  );
}

export function CategorySelect({ value, onChange }: { value: Id | null; onChange: (id: Id | null) => void }) {
  const m = useM();
  return (
    <select
      className={`select ${value ? "" : "unset"}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={m.config.categoryLabel}
    >
      <option value="">{m.config.categoryLabel}…</option>
      {m.categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

/**
 * The CW ticket behind a task's ref: summary and company, looked up once the number has
 * settled (and again with ↻). Shows nothing without a ticket number or without CW.
 */
export function TicketInfo({ task }: { task: Task }) {
  const m = useM();
  const a = useA();
  const n = ticketNumber(task.ref);
  const info = task.refInfo;
  // The last lookup this field ran, so a number that wasn't found isn't retried on every render.
  const [tried, setTried] = useState<{ n: string; busy: boolean; error: string | null } | null>(null);

  const lookup = async () => {
    setTried({ n, busy: true, error: null });
    const error = await a.lookupTicket(task.id);
    setTried({ n, busy: false, error });
  };

  useEffect(() => {
    if (!m.config.cw || !n || info || tried?.n === n) return;
    const id = setTimeout(() => void lookup(), 800);
    return () => clearTimeout(id);
  }, [m.config.cw, n, info, tried?.n]);

  if (!m.config.cw || !n) return null;
  const current = tried?.n === n ? tried : null;
  if (current?.busy) return <p className="ticket muted small">Looking up #{n}…</p>;
  if (current?.error) {
    return (
      <p className="ticket small">
        <span className="warn">{current.error}</span>
        <button className="btn subtle ticket-refresh" onClick={() => void lookup()}>
          Retry
        </button>
      </p>
    );
  }
  if (!info) return null;
  return (
    <p className="ticket small">
      <span className="ticket-text">
        <span className="ticket-summary">{info.summary}</span>
        <span className="muted">
          {[info.company, info.closed && "closed"].filter(Boolean).join(" · ")}
        </span>
      </span>
      <button className="btn subtle ticket-refresh" onClick={() => void lookup()} title="Refresh from ConnectWise" aria-label="Refresh ticket from ConnectWise">
        ↻
      </button>
    </p>
  );
}

/** A one-line "type a name, press Add" form. */
export function InlineAdd({
  value,
  onValue,
  placeholder,
  onAdd,
}: {
  value: string;
  onValue: (v: string) => void;
  placeholder: string;
  onAdd: (title: string) => void;
}) {
  return (
    <form
      className="row-actions inline-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value.trim());
        onValue("");
      }}
    >
      <input
        className="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        autoCapitalize="sentences"
        onChange={(e) => onValue(e.target.value)}
      />
      <button type="submit" className="btn" disabled={!value.trim()}>
        Add
      </button>
    </form>
  );
}
