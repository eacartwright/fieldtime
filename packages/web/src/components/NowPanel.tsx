import { durationMs, type Session } from "@fieldtime/shared";
import { clock, dayLabel, hm, timeOfDay } from "../format";
import { taskTotals, useA, useM, useNow, type TaskInfo } from "../model";
import { CategorySelect, DraftInput, DraftTextarea, GroupPicker } from "./fields";

// The top of the app: one card per running task, most recently started on top.
// Cards are keyed by position, not by session, so the top card's notes textarea
// stays mounted across switches (and while idle). That lets ▶ New focus it inside
// the tap itself, which is what makes the iPhone keyboard appear.

export function NowPanel({ onAlongside }: { onAlongside: () => void }) {
  const m = useM();
  const a = useA();
  const now = useNow(1000);
  const cards: (Session | null)[] = m.running.length ? m.running : [null];

  return (
    <div className="now-stack">
      {cards.map((s, i) => (
        <NowCard key={i} session={s} top={i === 0} now={now} />
      ))}
      {m.running.length > 0 && (
        <div className="now-foot">
          <button className="btn subtle" onClick={onAlongside} title="Start another task without stopping this one (Alt+Shift+N for a blank one)">
            + Also working on…
          </button>
          {m.running.length > 1 && (
            <button className="btn subtle" onClick={() => a.stop()}>
              Stop all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NowCard({ session, top, now }: { session: Session | null; top: boolean; now: number }) {
  const m = useM();
  const a = useA();
  const info = session ? m.tasks.get(session.taskId) : undefined;
  const earlier = info && session ? info.sessions.filter((s) => s.id !== session.id).reverse() : [];
  const running = session && info ? { session, info } : null;

  return (
    <section className={`now ${running ? "is-running" : "is-idle"} ${top ? "" : "compact"}`} aria-label="Now">
      {running ? <RunningHead {...running} now={now} /> : <IdleHead />}

      <DraftTextarea
        textareaRef={top ? a.notesRef : undefined}
        className="notes"
        value={session?.notes ?? ""}
        resetKey={session?.id ?? null}
        placeholder={
          session
            ? earlier.length
              ? "Continuing… (leave empty for “continuation of previous work”)"
              : "What are you doing? Notes save as you type."
            : "Start typing to start a new task…"
        }
        aria-label="Session notes"
        onValue={(notes) => {
          const id = session?.id ?? a.startNew();
          if (id) a.updateSession(id, { notes });
        }}
      />

      {earlier.length > 0 && (
        <details className="earlier">
          <summary>
            Earlier on this task · {earlier.length} session{earlier.length === 1 ? "" : "s"} ·{" "}
            {hm(earlier.reduce((t, s) => t + durationMs(s, now), 0))}
          </summary>
          <ul>
            {earlier.slice(0, 10).map((s) => (
              <li key={s.id}>
                <div className="muted small">
                  {dayLabel(s.start)} · {timeOfDay(s.start)}–{s.end ? timeOfDay(s.end) : "now"} ·{" "}
                  {hm(durationMs(s, now))}
                </div>
                <div className={`pre ${s.notes ? "" : "muted"}`}>{s.notes || "Continuation of previous work"}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function IdleHead() {
  return (
    <div className="now-top">
      <span className="idle-dot" aria-hidden />
      <span className="idle-label">Nothing running</span>
    </div>
  );
}

function RunningHead({ session, info, now }: { session: Session; info: TaskInfo; now: number }) {
  const a = useA();
  return (
    <>
      <div className="now-top">
        <span className="live-dot" aria-hidden />
        <span className="timer" aria-label="Elapsed">
          {clock(now - session.start)}
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => a.stop(session.id)} title="Stop (Alt+P stops the top one)">
          Stop
        </button>
      </div>
      <div className="muted small since">
        Started {timeOfDay(session.start)} · {hm(taskTotals(info, now).today)} on this task today
      </div>
      <DraftInput
        className="title-input"
        value={info.task.title}
        resetKey={info.task.id}
        placeholder={info.titleDerived ? info.title : "Title"}
        aria-label="Task title"
        onValue={(title) => a.updateTask(info.task.id, { title })}
      />
      <div className="now-meta">
        <GroupPicker value={info.task.groupId} onChange={(groupId) => a.updateTask(info.task.id, { groupId })} />
        <CategorySelect value={session.categoryId} onChange={(categoryId) => a.updateSession(session.id, { categoryId })} />
      </div>
    </>
  );
}
