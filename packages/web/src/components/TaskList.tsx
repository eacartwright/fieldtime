import { startOfDay, type Id } from "@fieldtime/shared";
import { useState } from "react";
import { hm, whenLabel } from "../format";
import { taskTotals, useA, useM, useNow, type TaskInfo } from "../model";

type View = "recent" | "today" | "inbox" | "done";

export function TaskList({ onOpen }: { onOpen: (id: Id) => void }) {
  const m = useM();
  const now = useNow(30_000);
  const [view, setView] = useState<View>("recent");
  const [groupId, setGroupId] = useState<Id | null>(null);

  const dayStart = startOfDay(now);
  const inView = (t: TaskInfo) => {
    switch (view) {
      case "recent":
        return t.task.status === "open" && !t.inbox;
      case "today":
        return t.sessions.some((s) => (s.end ?? now) > dayStart);
      case "inbox":
        return t.inbox;
      case "done":
        return t.task.status === "done";
    }
  };
  const base = m.recent.filter(inView);
  const list = groupId ? base.filter((t) => t.task.groupId === groupId) : base;
  if (view === "inbox") list.sort((a, b) => b.task.createdAt - a.task.createdAt);

  // Clients that appear in this view, most recently worked first.
  const groupsInView: { id: Id; name: string }[] = [];
  for (const t of base) {
    if (t.group && !groupsInView.some((g) => g.id === t.group!.id)) groupsInView.push(t.group);
  }
  const inboxCount = m.recent.filter((t) => t.inbox).length;
  const todayTotal = view === "today" ? list.reduce((sum, t) => sum + taskTotals(t, now).today, 0) : 0;

  return (
    <section className="list" aria-label="Tasks">
      <div className="tabs" role="tablist">
        {(["recent", "today", "inbox", "done"] as View[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={`tab ${view === v ? "on" : ""}`}
            onClick={() => setView(v)}
          >
            {v[0]!.toUpperCase() + v.slice(1)}
            {v === "inbox" && inboxCount > 0 && <span className="count">{inboxCount}</span>}
          </button>
        ))}
      </div>

      {groupsInView.length > 0 && (
        <div className="chips" aria-label={`Filter by ${m.config.groupLabel.toLowerCase()}`}>
          <button className={`chip ${groupId === null ? "chip-on" : ""}`} onClick={() => setGroupId(null)}>
            All
          </button>
          {groupsInView.map((g) => (
            <button
              key={g.id}
              className={`chip ${groupId === g.id ? "chip-on" : ""}`}
              onClick={() => setGroupId(groupId === g.id ? null : g.id)}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      {view === "today" && list.length > 0 && <div className="muted small total">Total today {hm(todayTotal)}</div>}

      <ul className="rows">
        {list.map((t) => (
          <TaskRow key={t.task.id} info={t} now={now} view={view} onOpen={onOpen} />
        ))}
      </ul>
      {list.length === 0 && <p className="empty">{EMPTY[view]}</p>}
    </section>
  );
}

const EMPTY: Record<View, string> = {
  recent: "Nothing yet. Press ▶ New and start typing.",
  today: "No time tracked today.",
  inbox: "Inbox is empty. Use + Inbox to capture work for later.",
  done: "No finished tasks.",
};

function TaskRow({ info, now, view, onOpen }: { info: TaskInfo; now: number; view: View; onOpen: (id: Id) => void }) {
  const m = useM();
  const a = useA();
  const running = m.running.find((s) => s.taskId === info.task.id);
  const { today, total } = taskTotals(info, now);
  const meta = [
    info.group?.name,
    info.task.ref && `#${info.task.ref}`,
    view === "inbox" ? `added ${whenLabel(info.task.createdAt, now)}` : whenLabel(info.lastTouched, now),
    view === "today" ? `${hm(today)} today` : total > 0 && hm(total),
  ].filter(Boolean);

  return (
    <li className={`row ${running ? "row-running" : ""}`}>
      <button className="row-main" onClick={() => onOpen(info.task.id)}>
        <span className={`row-title ${info.titleDerived ? "derived" : ""}`}>{info.title}</span>
        <span className="row-meta">{meta.join(" · ")}</span>
      </button>
      {running ? (
        <button className="row-live" onClick={() => a.stop(running.id)} aria-label={`Stop ${info.title}`} title="Stop">
          <span className="live-dot" aria-hidden />
          <span className="row-live-label">Running</span>
          <span className="row-live-stop">■ Stop</span>
        </button>
      ) : (
        <button
          className="play"
          onClick={(e) => {
            // Adds to whatever is running; Shift+click switches (stops the others).
            a.continueTask(info.task.id, !e.shiftKey);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label={`Start ${info.title}`}
          title="Start alongside what's running (Shift+click to switch to just this)"
        >
          ▶
        </button>
      )}
    </li>
  );
}
