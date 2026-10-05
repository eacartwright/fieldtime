import { matchesQuery } from "@fieldtime/shared";
import { useEffect, useRef, useState } from "react";
import { hm, whenLabel } from "../format";
import { taskTotals, useA, useM, type TaskInfo } from "../model";
import { Dialog } from "./Dialog";

// Find any task and continue it, or start a new one with what you typed.
// Ctrl+K or / on desktop, Find on the phone. In "alongside" mode (or with Shift),
// whatever is running keeps running.

type Item = { kind: "task"; info: TaskInfo } | { kind: "new"; title: string };

export function Switcher({ alongside = false, onClose }: { alongside?: boolean; onClose: () => void }) {
  const m = useM();
  const a = useA();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const now = Date.now();
  const runningIds = new Set(m.running.map((s) => s.taskId));

  const query = q.trim();
  const tasks = query
    ? m.recent.filter((t) => matchesQuery(t.haystack, query)).slice(0, 50)
    : m.recent.filter((t) => t.task.status === "open" && !(alongside && runningIds.has(t.task.id))).slice(0, 30);
  const items: Item[] = tasks.map((info) => ({ kind: "task" as const, info }));
  if (query) items.push({ kind: "new", title: query });
  else if (alongside) items.unshift({ kind: "new", title: "" });

  useEffect(() => {
    listRef.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const act = (item: Item | undefined, along: boolean) => {
    if (!item) return;
    if (item.kind === "new") a.startNew(item.title, null, along);
    else a.continueTask(item.info.task.id, along);
    onClose();
  };

  return (
    <Dialog title={alongside ? "Also working on…" : "Switch task"} onClose={onClose} className="switcher">
      <input
        className="search"
        autoFocus
        value={q}
        placeholder="Search tasks, clients, notes… or type a new task"
        aria-label="Search tasks"
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          const along = alongside || e.shiftKey;
          if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, items.length - 1));
          else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
          else if (e.key === "Enter" && (e.ctrlKey || e.altKey || e.metaKey))
            act(query ? { kind: "new", title: query } : undefined, along);
          else if (e.key === "Enter") act(items[sel], along);
          else return;
          e.preventDefault();
        }}
      />
      <ul className="results" ref={listRef} role="listbox">
        {items.map((item, i) => (
          <li key={item.kind === "new" ? "new" : item.info.task.id}>
            <button
              className={i === sel ? "active" : ""}
              onMouseEnter={() => setSel(i)}
              onClick={(e) => act(item, alongside || e.shiftKey)}
            >
              {item.kind === "new" ? (
                <span className="result-new">
                  ▶ New task{item.title ? ": " : ""}
                  <strong>{item.title}</strong>
                </span>
              ) : (
                <ResultRow info={item.info} now={now} running={runningIds.has(item.info.task.id)} />
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="hint muted small">
        ↑↓ move · Enter {alongside ? "start alongside" : "switch"}
        {alongside ? "" : " · Shift+Enter alongside"} · Ctrl+Enter new task · Esc close
      </div>
    </Dialog>
  );
}

function ResultRow({ info, now, running }: { info: TaskInfo; now: number; running: boolean }) {
  const { total } = taskTotals(info, now);
  const meta = [
    info.group?.name,
    info.task.ref && `#${info.task.ref.trim().replace(/^#+/, "")}`,
    info.inbox ? "inbox" : whenLabel(info.lastTouched, now),
    total > 0 && hm(total),
    info.task.status === "done" && "done",
    running && "running",
  ].filter(Boolean);
  return (
    <span className="result">
      <span className={`row-title ${info.titleDerived ? "derived" : ""}`}>{info.title}</span>
      <span className="row-meta">{meta.join(" · ")}</span>
    </span>
  );
}
