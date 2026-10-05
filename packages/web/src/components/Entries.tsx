import { durationMs, firstLine, startOfDay, type Id, type Ms, type Session } from "@fieldtime/shared";
import { useRef, useState } from "react";
import { copyText } from "../clipboard";
import { dayLabel, hm, whenLabel } from "../format";
import { useA, useM, useNow, type TaskInfo } from "../model";
import { Dialog } from "./Dialog";
import { CategorySelect, GroupPicker } from "./fields";
import { defaultManualSpan, SessionEditor } from "./SessionEditor";

// Time entries, ready to type into ConnectWise. Grouped by task (you enter them ticket by
// ticket): the task's Ticket # and Client once, then one block per session (one session =
// one CW entry) with the rest of CW's fields. Every field copies with one click.
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
  const [openIds, setOpenIds] = useState<Set<Id>>(() => new Set());

  const all = Object.values(m.view.sessions)
    .filter((s) => !s.deleted && m.tasks.has(s.taskId))
    .sort((a, b) => a.start - b.start);
  const todo = all.filter((s) => !s.enteredAt);
  const list = mode === "todo" ? todo : all.filter((s) => s.start >= day && s.start < addDays(day, 1));

  // One group per task, since entries go into CW ticket by ticket. Within a task, oldest first
  // with a still-running session last; tasks ordered by their oldest entry, running-only ones last.
  const byTask = new Map<Id, Session[]>();
  for (const s of list) byTask.set(s.taskId, [...(byTask.get(s.taskId) ?? []), s]);
  const groups = [...byTask.entries()]
    .map(([taskId, sessions]) => ({
      info: m.tasks.get(taskId)!,
      sessions: [...sessions.filter((s) => s.end !== null), ...sessions.filter((s) => s.end === null)],
    }))
    .sort((a, b) => {
      const key = (g: typeof a) => (g.sessions[0]!.end === null ? Infinity : g.sessions[0]!.start);
      return key(a) - key(b);
    });

  const toggle = (id: Id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

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
          <span className="spacer" />
          {list.length > 0 && <span className="muted small">{hm(list.reduce((t, s) => t + durationMs(s, now), 0))}</span>}
        </div>
      )}

      {groups.map((g) => (
        <TaskGroup
          key={g.info.task.id}
          info={g.info}
          sessions={g.sessions}
          now={now}
          // A single ticket needs no extra tap.
          open={groups.length === 1 || openIds.has(g.info.task.id)}
          onToggle={() => toggle(g.info.task.id)}
          day={mode === "day" ? day : null}
        />
      ))}
      {list.length === 0 && (
        <p className="empty">{mode === "todo" ? "All caught up. Nothing left to enter." : "No time tracked this day."}</p>
      )}
    </Dialog>
  );
}

function TaskGroup({
  info,
  sessions,
  now,
  open,
  onToggle,
  day,
}: {
  info: TaskInfo;
  sessions: Session[];
  now: number;
  open: boolean;
  onToggle: () => void;
  /** The day being shown in By day, for "+ Add time". */
  day: Ms | null;
}) {
  const m = useM();
  const a = useA();
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [merging, setMerging] = useState(false);
  const [picked, setPicked] = useState<Set<Id>>(() => new Set());
  const pickedList = sessions.filter((s) => picked.has(s.id));
  const pickedSameDay = pickedList.every((s) => startOfDay(s.start) === startOfDay(pickedList[0]!.start));
  const changed = sessions.filter((s) => s.changedSinceEntered && !s.enteredAt).length;
  const ref = info.task.ref.trim().replace(/^#/, "");
  const total = sessions.reduce((t, s) => t + durationMs(s, now), 0);
  const entered = sessions.filter((s) => s.enteredAt).length;
  const enterable = sessions.filter((s) => !s.enteredAt && s.end !== null);
  const missing = [
    !ref && "ticket #",
    !info.group && m.config.groupLabel.toLowerCase(),
    sessions.some((s) => !s.categoryId) && m.config.categoryLabel.toLowerCase(),
    changed > 0 && `CW update (${changed} changed)`,
  ].filter(Boolean);
  const meta = [
    ref && `#${ref}`,
    info.group?.name,
    entered ? `${entered} of ${sessions.length} entered` : `${sessions.length} ${sessions.length === 1 ? "entry" : "entries"}`,
    hm(total),
  ].filter(Boolean);

  return (
    <section className={`entry-task ${open ? "open" : ""} ${enterable.length === 0 && entered ? "entered" : ""}`}>
      <button className="entry-task-head" onClick={onToggle} aria-expanded={open}>
        <span className="entry-task-text">
          <span className={`row-title ${info.titleDerived ? "derived" : ""}`}>{info.title}</span>
          <span className="row-meta">{meta.join(" · ")}</span>
          {missing.length > 0 && <span className="warn small">⚠ needs {missing.join(", ")}</span>}
        </span>
        <svg className="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {open && (
        <div className="entry-task-body">
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
          </div>

          {merging ? (
            <div className="merge-pick">
              <p className="muted small">Pick the entries to combine (same day). Earliest start to latest end, notes joined.</p>
              {sessions.map((s) => (
                <label key={s.id} className={`merge-row ${picked.has(s.id) ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={picked.has(s.id)}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (!next.delete(s.id)) next.add(s.id);
                        return next;
                      })
                    }
                  />
                  <span className="merge-row-text">
                    <span>
                      {dayLabel(s.start, now)} · {cwTime(s.start)}–{s.end ? cwTime(s.end) : "now"} ·{" "}
                      {(durationMs(s, now) / 3_600_000).toFixed(2)} h
                    </span>
                    <span className="row-meta">{firstLine(s.notes) || CONTINUATION}</span>
                  </span>
                </label>
              ))}
              <div className="entry-foot">
                {pickedList.length > 1 && !pickedSameDay && <span className="warn small">Must be the same day</span>}
                <span className="spacer" />
                <button
                  className="btn"
                  onClick={() => {
                    setMerging(false);
                    setPicked(new Set());
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  disabled={pickedList.length < 2 || !pickedSameDay}
                  onClick={() => {
                    a.mergeSessions(pickedList.map((s) => s.id));
                    setMerging(false);
                    setPicked(new Set());
                  }}
                >
                  Merge {pickedList.length > 1 ? pickedList.length : ""}
                </button>
              </div>
            </div>
          ) : (
            <>
              {sessions.map((s) => (
                <SessionEntry
                  key={s.id}
                  session={s}
                  now={now}
                  editing={editingId === s.id}
                  onEdit={() => setEditingId(editingId === s.id ? null : s.id)}
                />
              ))}
              <div className="entry-foot">
                <button
                  className="btn subtle"
                  onClick={() => {
                    const { start, end } = defaultManualSpan(day);
                    setEditingId(a.createSession(info.task.id, start, end));
                  }}
                >
                  + Add time
                </button>
                {sessions.length > 1 && (
                  <button className="btn subtle" onClick={() => setMerging(true)}>
                    Merge…
                  </button>
                )}
                <span className="spacer" />
                {enterable.length > 1 && (
                  <button
                    className="btn"
                    onClick={() => {
                      const at = Date.now();
                      for (const s of enterable) a.updateSession(s.id, { enteredAt: at });
                    }}
                  >
                    ✓ Mark all {enterable.length} entered
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function SessionEntry({
  session: s,
  now,
  editing,
  onEdit,
}: {
  session: Session;
  now: number;
  editing: boolean;
  onEdit: () => void;
}) {
  const m = useM();
  const a = useA();
  const running = s.end === null;
  const category = s.categoryId ? m.view.categories[s.categoryId] : undefined;
  const dur = durationMs(s, now);

  if (editing) {
    return (
      <article className="entry editing">
        <SessionEditor session={s} onDone={onEdit} />
      </article>
    );
  }

  return (
    <article className={`entry ${s.enteredAt ? "entered" : ""}`}>
      {s.changedSinceEntered && !s.enteredAt && (
        <div className="warn small">⚠ Changed after you entered it. Update the entry in ConnectWise, then mark it again.</div>
      )}
      <div className="entry-times">
        <CopyField label="Date" value={cwDate(s.start)} stacked />
        <CopyField label="Start" value={cwTime(s.start)} stacked />
        {running ? (
          <Missing label="End" stacked>
            <span className="muted">running</span>
          </Missing>
        ) : (
          <CopyField label="End" value={cwTime(s.end!)} stacked />
        )}
        <CopyField label="Hours" value={(dur / 3_600_000).toFixed(2)} stacked />
      </div>
      <div className="entry-fields">
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
        <span className="muted small">{dayLabel(s.start, now)}</span>
        <button className="btn subtle" onClick={onEdit} aria-label="Edit this entry">
          ✎ Edit
        </button>
        <span className="spacer" />
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
function CopyField({ label, value, multiline, stacked }: { label: string; value: string; multiline?: boolean; stacked?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <button
      type="button"
      className={`copy-field ${multiline ? "multi" : ""} ${stacked ? "stacked" : ""} ${copied ? "copied" : ""}`}
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

function Missing({ label, children, stacked }: { label: string; children: React.ReactNode; stacked?: boolean }) {
  return (
    <div className={`copy-field missing ${stacked ? "stacked" : ""}`}>
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
