import { ticketNumber, type Id, type Task } from "@fieldtime/shared";
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

/** Pick a client (group), or type a new name to add one. */
export function GroupPicker({ value, onChange }: { value: Id | null; onChange: (id: Id | null) => void }) {
  const m = useM();
  const a = useA();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const current = value ? m.view.groups[value] : undefined;
  const label = m.config.groupLabel;

  const query = q.trim().toLowerCase();
  const matches = m.groups.filter((g) => g.name.toLowerCase().includes(query)).slice(0, 8);
  const exact = m.groups.some((g) => g.name.toLowerCase() === query);
  const options: { key: string; text: string; pick: () => void }[] = [
    ...matches.map((g) => ({ key: g.id, text: g.name, pick: () => onChange(g.id) })),
    ...(query && !exact ? [{ key: "+", text: `Add “${q.trim()}”`, pick: () => onChange(a.createGroup(q)) }] : []),
    ...(value ? [{ key: "-", text: `No ${label.toLowerCase()}`, pick: () => onChange(null) }] : []),
  ];

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
      <button type="button" className={`chip ${current ? "chip-set" : ""}`} onClick={() => setOpen(true)}>
        {current ? current.name : `+ ${label}`}
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
        placeholder={`Find or add ${label.toLowerCase()}…`}
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
