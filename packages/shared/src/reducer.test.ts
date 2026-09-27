import { describe, expect, it } from "vitest";
import { displayTitle, firstLine, sessionsByTask } from "./derive";
import type { Op, OpEnvelope, StartMode } from "./ops";
import { applyOp, openSessions } from "./reducer";
import { emptyState, type State } from "./types";

const H = 3_600_000;
const M = 60_000;
const S = 1000;
const T0 = new Date(2026, 8, 28, 8, 0).getTime(); // Mon 8:00

let n = 0;
function run(state: State, at: number, op: Op) {
  const env: OpEnvelope = { id: `op${n++}`, at, op };
  applyOp(state, env);
}
const startNew = (s: State, at: number, taskId: string, mode?: StartMode) =>
  run(s, at, { type: "task.start", taskId, sessionId: `${taskId}@${at}`, newTask: { title: "", groupId: null }, mode });
const cont = (s: State, at: number, taskId: string, mode?: StartMode) =>
  run(s, at, { type: "task.start", taskId, sessionId: `${taskId}@${at}`, mode });
const stop = (s: State, at: number, sessionId?: string) => run(s, at, { type: "timer.stop", sessionId });
const note = (s: State, at: number, sessionId: string, notes: string) =>
  run(s, at, { type: "session.update", sessionId, patch: { notes } });

const live = (s: State, taskId: string) => sessionsByTask(s).get(taskId) ?? [];
const openTasks = (s: State) => openSessions(s).map((x) => x.taskId).sort();
const span = (s: State, id: string) => {
  const x = s.sessions[id]!;
  return [x.start, x.end];
};

describe("switching", () => {
  it("starting a task stops the running one at the same instant", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    expect(span(s, `A@${T0}`)).toEqual([T0, T0 + H]);
    expect(openTasks(s)).toEqual(["B"]);
  });

  it("continuing an earlier task opens a new session on it", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    startNew(s, T0 + 2 * H, "C");
    cont(s, T0 + 3 * H, "A");
    expect(live(s, "A")).toHaveLength(2);
    expect(openTasks(s)).toEqual(["A"]);
  });

  it("stop with no target stops everything", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + M, "B", "alongside");
    stop(s, T0 + H);
    expect(openTasks(s)).toEqual([]);
  });

  it("new session inherits the task's previous work type", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    run(s, T0 + M, { type: "session.update", sessionId: `A@${T0}`, patch: { categoryId: "remote" } });
    startNew(s, T0 + H, "B");
    cont(s, T0 + 2 * H, "A");
    expect(s.sessions[`A@${T0 + 2 * H}`]!.categoryId).toBe("remote");
  });

  it("finishing a running task stops it", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    run(s, T0 + H, { type: "task.update", taskId: "A", patch: { status: "done" } });
    expect(openTasks(s)).toEqual([]);
  });

  it("applying the same start twice is harmless", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0, "A");
    expect(Object.keys(s.sessions)).toHaveLength(1);
  });
});

describe("alongside", () => {
  it("runs several tasks at once", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + M, "B", "alongside");
    startNew(s, T0 + 2 * M, "C", "alongside");
    expect(openTasks(s)).toEqual(["A", "B", "C"]);
  });

  it("stopping one leaves the others running", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + M, "B", "alongside");
    stop(s, T0 + H, `A@${T0}`);
    expect(openTasks(s)).toEqual(["B"]);
  });

  it("a switch stops all of them", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + M, "B", "alongside");
    startNew(s, T0 + H, "C");
    expect(openTasks(s)).toEqual(["C"]);
  });

  it("a task never gets two open sessions", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    cont(s, T0 + H, "A", "alongside");
    cont(s, T0 + 2 * H, "A");
    expect(live(s, "A")).toHaveLength(1);
    expect(openTasks(s)).toEqual(["A"]);
  });
});

describe("blips and resuming", () => {
  it("discards a short, empty session on a task that already has time", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    cont(s, T0 + 2 * H, "A"); // oops
    startNew(s, T0 + 2 * H + 10 * S, "C"); // 10s later
    expect(live(s, "A")).toHaveLength(1);
  });

  it("keeps a short session if notes were written", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    cont(s, T0 + 2 * H, "A");
    note(s, T0 + 2 * H + 5 * S, `A@${T0 + 2 * H}`, "quick check");
    startNew(s, T0 + 2 * H + 10 * S, "C");
    expect(live(s, "A")).toHaveLength(2);
  });

  it("keeps a new task's first session however short", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + 5 * S, "B");
    expect(live(s, "A")).toHaveLength(1);
  });

  it("coming back within the gap reopens the previous session", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + 5 * M, "B");
    cont(s, T0 + 10 * M, "A");
    startNew(s, T0 + 15 * M, "B2");
    cont(s, T0 + 20 * M, "A");
    const a = live(s, "A");
    expect(a).toHaveLength(1);
    expect(a[0]!.start).toBe(T0);
    expect(a[0]!.end).toBeNull();
  });

  it("coming back after the gap starts a new session", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + 5 * M, "B");
    cont(s, T0 + 30 * M, "A");
    expect(live(s, "A")).toHaveLength(2);
  });
});

describe("merge", () => {
  it("combines sessions: earliest start, latest end, notes joined, empty ones skipped", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    note(s, T0 + M, `A@${T0}`, "checked logs");
    startNew(s, T0 + H, "B");
    cont(s, T0 + 2 * H, "A"); // empty: continuation
    startNew(s, T0 + 3 * H, "C");
    cont(s, T0 + 4 * H, "A");
    note(s, T0 + 4 * H + M, `A@${T0 + 4 * H}`, "replaced cable");
    stop(s, T0 + 5 * H);
    run(s, T0 + 6 * H, {
      type: "session.merge",
      sessionIds: [`A@${T0}`, `A@${T0 + 2 * H}`, `A@${T0 + 4 * H}`],
    });
    const a = live(s, "A");
    expect(a).toHaveLength(1);
    expect([a[0]!.start, a[0]!.end]).toEqual([T0, T0 + 5 * H]);
    expect(a[0]!.notes).toBe("checked logs\nreplaced cable");
  });

  it("refuses to merge sessions of different tasks", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    run(s, T0 + 2 * H, { type: "session.merge", sessionIds: [`A@${T0}`, `B@${T0 + H}`] });
    expect(live(s, "A")).toHaveLength(1);
    expect(live(s, "B")).toHaveLength(1);
  });
});

describe("late ops (phone was offline)", () => {
  it("a late switch lands between the sessions around it", () => {
    const s = emptyState();
    startNew(s, T0, "A"); // desktop 8:00
    startNew(s, T0 + 2 * H, "C"); // desktop 10:00
    startNew(s, T0 + H, "B"); // phone 9:00, arrives late
    expect(span(s, `A@${T0}`)).toEqual([T0, T0 + H]);
    expect(span(s, `B@${T0 + H}`)).toEqual([T0 + H, T0 + 2 * H]);
    expect(openTasks(s)).toEqual(["C"]);
  });

  it("a late switch during a pause runs until the next start", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    stop(s, T0 + H);
    startNew(s, T0 + 3 * H, "C");
    startNew(s, T0 + 2 * H, "B"); // late
    expect(span(s, `B@${T0 + 2 * H}`)).toEqual([T0 + 2 * H, T0 + 3 * H]);
    expect(openTasks(s)).toEqual(["C"]);
  });

  it("a late switch inside a later-paused session keeps the pause time", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    stop(s, T0 + 2 * H);
    startNew(s, T0 + H, "B"); // late
    expect(span(s, `A@${T0}`)).toEqual([T0, T0 + H]);
    expect(span(s, `B@${T0 + H}`)).toEqual([T0 + H, T0 + 2 * H]);
    expect(openTasks(s)).toEqual([]);
  });
});

describe("titles", () => {
  it("uses the first line of the notes until the task is named", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    note(s, T0 + M, `A@${T0}`, "\n- Acme printer offline\n- rebooted spooler");
    expect(displayTitle(s.tasks.A!, live(s, "A"))).toEqual({ text: "Acme printer offline", derived: true });
    run(s, T0 + 2 * M, { type: "task.update", taskId: "A", patch: { title: "Printer" } });
    expect(displayTitle(s.tasks.A!, live(s, "A")).text).toBe("Printer");
  });

  it("strips list and checkbox markers", () => {
    expect(firstLine("  * [ ] call ISP")).toBe("call ISP");
    expect(firstLine("## Heading")).toBe("Heading");
    expect(firstLine("1. first")).toBe("first");
  });
});
