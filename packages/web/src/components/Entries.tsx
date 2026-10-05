import { durationMs, startOfDay, type Ms, type Session } from "@fieldtime/shared";
import { useRef, useState } from "react";
import { copyText } from "../clipboard";
import { dayLabel, hm, whenLabel } from "../format";
import { useA, useM, useNow, type TaskInfo } from "../model";
import { Dialog } from "./Dialog";
import { CategorySelect, GroupPicker } from "./fields";

// Time entries, ready to type into ConnectWise: one card per session (one session =
// one CW entry), fields in the order of CW's form, each copied with one click.
// "To enter" is everything not yet marked entered, across days; "By day" is a day's log.

type Mode = "todo" | "day";

const CONTINUATION = "Continuation of previous work";
const pad = (n: number) => n.toString().padStart(2, "0");

// Built by hand: toLocale* puts a narrow no-break space before AM/PM, which pastes badly.
function cwDate(t: Ms) {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}
function cwTime(t: Ms) {
  const d = new Date(t);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}
/** Start of the day `n` days from `day` (safe across DST changes). */
const addDays = (day: Ms, n: number) => startOfDay(day + n * 86_400_000 + 12 * 3_600_000);
const toInputDate = (t: Ms) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function Entries({ onClose }: { onClose: () => void }) {
  const m = useM();
  const now = useNow(30_000);
  const [mode, setMode] = useState<Mode>("todo");
  const [day, setDay] = useState(() => startOfDay(Date.now()));

  const all = Object.values(m.view.sessions)
    .filter((s) => !s.deleted && m.tasks.has(s.taskId))
    .sort((a, b) => a.start - b.start);
  const todo = all.filter((s) => !s.enteredAt);
  const list =
    mode === "todo"
      ? // Still-running ones can't be entered yet; keep them out of the way at the end.
        [...todo.filter((s) => s.end !== null), ...todo.filter((s) => s.end === null)]
      : all.filter((s) => s.start >= day && s.start < addDays(day, 1));

  // Day headings with that day's total, wherever the day changes.
  const groups: { day: Ms; sessions: Session[] }[] = [];
  for (const s of list) {
    const d = s.end === null && mode === "todo" ? -1 : startOfDay(s.start);
    const last = groups[groups.length - 1];
    if (last && last.day === d) last.sessions.push(s);
    else groups.push({ day: d, sessions: [s] });
  }

  return (
    <Dialog title="Time entries" onClose={onClose} className="entries">
      <div className="tabs tabs-2" role="tablist">
        <button role="tab" aria-selected={mode === "todo"} className={`tab ${mode === "todo" ? "on" : ""}`} onClick={() => setMode("todo")}>
          To enter
          {todo.length > 0 && <span className="count">{todo.length}</span>}
        </button>
        <button role="tab" aria-selected={mode === "day"} className={`tab ${mode === "day" ? "on" : ""}`} onClick={() => setMode("day")}>
          By day
        </button>
      </div>

      {mode === "day" && (
        <div className="day-nav">
          <button className="btn icon" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
            ‹
          </button>
          <input
            type="date"
            className="day-input"
            value={toInputDate(day)}
            onChange={(e) => {
              const [y, mo, d] = e.target.value.split("-").map(Number);
              if (y && mo && d) setDay(new Date(y, mo - 1, d).getTime());
            }}
            aria-label="Day"
          />
          <button className="btn icon" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
            ›
          </button>
          {day !== startOfDay(now) && (
            <button className="btn" onClick={() => setDay(startOfDay(now))}>
              Today
            </button>
          )}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.day} className="entry-day">
          <h3>
            <span>{g.day === -1 ? "Still running" : dayLabel(g.day, now)}</span>
            <span className="muted">{hm(g.sessions.reduce((t, s) => t + durationMs(s, now), 0))}</span>
          </h3>
          {g.sessions.map((s) => (
            <EntryCard key={s.id} session={s} info={m.tasks.get(s.taskId)!} now={now} />
          ))}
        </section>
      ))}
      {list.length === 0 && (
        <p className="empty">{mode === "todo" ? "All caught up. Nothing left to enter." : "No time tracked this day."}</p>
      )}
    </Dialog>
  );
}

function EntryCard({ session: s, info, now }: { session: Session; info: TaskInfo; now: number }) {
  const m = useM();
  const a = useA();
  const running = s.end === null;
  const ref = info.task.ref.trim().replace(/^#/, "");
  const category = s.categoryId ? m.view.categories[s.categoryId] : undefined;
  const dur = durationMs(s, now);

  return (
    <article className={`entry ${s.enteredAt ? "entered" : ""}`}>
      <header className="entry-head">
        <span className={`row-title ${info.titleDerived ? "derived" : ""}`}>{info.title}</span>
        <span className="muted small">{hm(dur)}</span>
      </header>

      <div className="entry-fields">
        {ref ? (
          <CopyField label="Ticket #" value={ref} />
        ) : (
          <Missing label="Ticket #">
            <CommitInput placeholder="Add ticket #" onCommit={(v) => a.updateTask(info.task.id, { ref: v })} />
          </Missing>
        )}
        {info.group ? (
          <CopyField label={m.config.groupLabel} value={info.group.name} />
        ) : (
          <Missing label={m.config.groupLabel}>
            <GroupPicker value={null} onChange={(groupId) => a.updateTask(info.task.id, { groupId })} />
          </Missing>
        )}
        <CopyField label="Date" value={cwDate(s.start)} />
        <CopyField label="Start" value={cwTime(s.start)} />
        {running ? (
          <Missing label="End">
            <span className="muted">still running</span>
          </Missing>
        ) : (
          <CopyField label="End" value={cwTime(s.end!)} />
        )}
        <CopyField label="Hours" value={(dur / 3_600_000).toFixed(2)} />
        {category ? (
          <CopyField label={m.config.categoryLabel} value={category.name} />
        ) : (
          <Missing label={m.config.categoryLabel}>
            <CategorySelect value={null} onChange={(categoryId) => a.updateSession(s.id, { categoryId })} />
          </Missing>
        )}
        <CopyField label="Notes" value={s.notes.trim() || CONTINUATION} multiline />
      </div>

      <footer className="entry-foot">
        {s.enteredAt ? (
          <>
            <span className="entered-label">✓ Entered {whenLabel(s.enteredAt, now)}</span>
            <button className="btn subtle" onClick={() => a.updateSession(s.id, { enteredAt: null })}>
              Undo
            </button>
          </>
        ) : (
          <button
            className="btn primary"
            disabled={running}
            title={running ? "Stop it first" : "Done in ConnectWise"}
            onClick={() => a.updateSession(s.id, { enteredAt: Date.now() })}
          >
            ✓ Mark entered
          </button>
        )}
      </footer>
    </article>
  );
}

/** A field you copy with one click (or Enter/Space). */
function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <button
      type="button"
      className={`copy-field ${multiline ? "multi" : ""} ${copied ? "copied" : ""}`}
      title={`Copy ${label}`}
      onClick={async () => {
        if (!(await copyText(value))) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1400);
      }}
    >
      <span className="copy-label">{label}</span>
      <span className="copy-value">{value}</span>
      <span className="copy-hint" aria-live="polite">
        {copied ? "Copied ✓" : "Copy"}
      </span>
    </button>
  );
}

function Missing({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="copy-field missing">
      <span className="copy-label">{label}</span>
      <span className="copy-value">{children}</span>
      <span className="copy-hint warn" aria-hidden>
        ⚠
      </span>
    </div>
  );
}

/** Saves on Enter or blur, so the card doesn't swap the input out mid-typing. */
function CommitInput({ placeholder, onCommit }: { placeholder: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState("");
  const commit = () => v.trim() && onCommit(v.trim().replace(/^#/, ""));
  return (
    <input
      className="ref-input"
      value={v}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}
