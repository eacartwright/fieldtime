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

describe("settings", () => {
  const set = (s: State, patch: { blipSec?: number; resumeGapMin?: number }) =>
    run(s, T0 - H, { type: "settings.update", patch });

  it("blip discard can be turned off", () => {
    const s = emptyState();
    set(s, { blipSec: 0 });
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    cont(s, T0 + 2 * H, "A");
    startNew(s, T0 + 2 * H + 5 * S, "C");
    expect(live(s, "A")).toHaveLength(2);
  });

  it("resume gap follows the setting, and 0 turns it off", () => {
    const s = emptyState();
    set(s, { resumeGapMin: 0 });
    startNew(s, T0, "A");
    startNew(s, T0 + 5 * M, "B");
    cont(s, T0 + 6 * M, "A");
    expect(live(s, "A")).toHaveLength(2);

    const s2 = emptyState();
    set(s2, { resumeGapMin: 30 });
    startNew(s2, T0, "A");
    startNew(s2, T0 + 5 * M, "B");
    cont(s2, T0 + 25 * M, "A");
    expect(live(s2, "A")).toHaveLength(1);
  });

  it("clamps bad values", () => {
    const s = emptyState();
    set(s, { blipSec: -5, resumeGapMin: 99999 });
    expect([s.settings!.blipSec, s.settings!.resumeGapMin]).toEqual([0, 240]);
  });
});

describe("pause", () => {
  const pause = (s: State, at: number, sessionId: string) => run(s, at, { type: "timer.pause", sessionId });
  const paused = (s: State) =>
    Object.values(s.tasks)
      .filter((t) => t.pausedAt)
      .map((t) => t.id)
      .sort();

  it("stops the clock but keeps the task paused", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    pause(s, T0 + H, `A@${T0}`);
    expect(span(s, `A@${T0}`)).toEqual([T0, T0 + H]);
    expect(paused(s)).toEqual(["A"]);
  });

  it("switching pauses what was running; alongside doesn't", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    startNew(s, T0 + 2 * H, "C", "alongside");
    expect(paused(s)).toEqual(["A"]);
    expect(openTasks(s)).toEqual(["B", "C"]);
  });

  it("starting a paused task unpauses it (and resumes the same session within the gap)", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    pause(s, T0 + H, `A@${T0}`);
    cont(s, T0 + H + 5 * M, "A");
    expect(paused(s)).toEqual([]);
    expect(live(s, "A")).toHaveLength(1);
    expect(openTasks(s)).toEqual(["A"]);
  });

  it("stopping a paused task takes it off the stack", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    run(s, T0 + 2 * H, { type: "timer.stop", taskId: "A" });
    expect(paused(s)).toEqual([]);
    expect(openTasks(s)).toEqual(["B"]);
  });

  it("pause all pauses everything running", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + M, "B", "alongside");
    run(s, T0 + H, { type: "timer.pause" });
    expect(openTasks(s)).toEqual([]);
    expect(paused(s)).toEqual(["A", "B"]);
    expect(span(s, `B@${T0 + M}`)).toEqual([T0 + M, T0 + H]);
  });

  it("stop all stops everything and clears paused tasks", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    stop(s, T0 + 2 * H);
    expect(paused(s)).toEqual([]);
    expect(openTasks(s)).toEqual([]);
  });

  it("a late switch landing inside a finished session doesn't pause that task", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    run(s, T0 + 2 * H, { type: "timer.stop", taskId: "A" });
    startNew(s, T0 + H, "B"); // arrives late from the phone
    expect(paused(s)).toEqual([]);
  });
});

describe("entered elsewhere", () => {
  const enter = (s: State, at: number, sessionId: string) =>
    run(s, at, { type: "session.update", sessionId, patch: { enteredAt: at } });

  it("coming back within the gap doesn't reopen a session already entered", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    enter(s, T0 + H + M, `A@${T0}`);
    cont(s, T0 + H + 5 * M, "A");
    const a = live(s, "A");
    expect(a).toHaveLength(2);
    expect(a[0]!.end).toBe(T0 + H);
  });

  it("a merge only counts as entered if every part was", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    startNew(s, T0 + H, "B");
    cont(s, T0 + 2 * H, "A");
    stop(s, T0 + 3 * H);
    enter(s, T0 + 4 * H, `A@${T0}`);
    run(s, T0 + 5 * H, { type: "session.merge", sessionIds: [`A@${T0}`, `A@${T0 + 2 * H}`] });
    expect(live(s, "A")[0]!.enteredAt).toBeNull();
  });
});

describe("editing", () => {
  const enter = (s: State, at: number, sessionId: string) =>
    run(s, at, { type: "session.update", sessionId, patch: { enteredAt: at } });

  it("editing an entered session puts it back to enter, flagged; re-marking clears the flag", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    stop(s, T0 + H);
    enter(s, T0 + 2 * H, `A@${T0}`);
    run(s, T0 + 3 * H, { type: "session.update", sessionId: `A@${T0}`, patch: { start: T0 - 15 * M } });
    const a = s.sessions[`A@${T0}`]!;
    expect([a.start, a.enteredAt, a.changedSinceEntered]).toEqual([T0 - 15 * M, null, true]);
    enter(s, T0 + 4 * H, `A@${T0}`);
    expect(s.sessions[`A@${T0}`]!.changedSinceEntered).toBe(false);
  });

  it("re-saving the same value doesn't count as a change", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    stop(s, T0 + H);
    enter(s, T0 + 2 * H, `A@${T0}`);
    run(s, T0 + 3 * H, { type: "session.update", sessionId: `A@${T0}`, patch: { start: T0 } });
    expect(s.sessions[`A@${T0}`]!.enteredAt).toBe(T0 + 2 * H);
  });

  it("adds a manual session with the task's work type", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    run(s, T0 + M, { type: "session.update", sessionId: `A@${T0}`, patch: { categoryId: "remote" } });
    stop(s, T0 + H);
    run(s, T0 + 5 * H, { type: "session.create", sessionId: "m1", taskId: "A", start: T0 + 2 * H, end: T0 + 3 * H });
    expect(live(s, "A")).toHaveLength(2);
    expect(s.sessions.m1!.categoryId).toBe("remote");
  });

  it("refuses a manual session that ends before it starts", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    run(s, T0 + H, { type: "session.create", sessionId: "m1", taskId: "A", start: T0 + H, end: T0 });
    expect(s.sessions.m1).toBeUndefined();
  });

  it("deletes and undeletes a session", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    stop(s, T0 + H);
    run(s, T0 + 2 * H, { type: "session.delete", sessionId: `A@${T0}` });
    expect(live(s, "A")).toHaveLength(0);
    run(s, T0 + 2 * H, { type: "session.delete", sessionId: `A@${T0}`, undo: true });
    expect(live(s, "A")).toHaveLength(1);
  });

  it("undoing the delete of a running session can't give a task two open sessions", () => {
    const s = emptyState();
    startNew(s, T0, "A");
    run(s, T0 + H, { type: "session.delete", sessionId: `A@${T0}` });
    cont(s, T0 + 2 * H, "A");
    run(s, T0 + 3 * H, { type: "session.delete", sessionId: `A@${T0}`, undo: true });
    expect(openSessions(s).filter((x) => x.taskId === "A")).toHaveLength(1);
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

describe("ticket lookup", () => {
  const info = { summary: "Printer offline", company: "Acme", closed: false, fetchedAt: T0 };
  const withTask = (title = "") => {
    const s = emptyState();
    run(s, T0, { type: "group.create", groupId: "acme", name: "Acme" });
    run(s, T0, { type: "task.create", taskId: "A", title, groupId: null });
    run(s, T0, { type: "task.update", taskId: "A", patch: { ref: "#123 " } });
    return s;
  };
  const lookup = (s: State, ref: string, groupId: string | null = "acme") =>
    run(s, T0 + M, { type: "task.refInfo", taskId: "A", ref, info, groupId });

  it("fills an untitled task's title and client", () => {
    const s = withTask();
    lookup(s, "123");
    expect(s.tasks.A).toMatchObject({ refInfo: info, title: "Printer offline", groupId: "acme" });
  });

  it("never replaces a title or client set meanwhile", () => {
    const s = withTask("My title");
    run(s, T0, { type: "group.create", groupId: "other", name: "Other" });
    run(s, T0, { type: "task.update", taskId: "A", patch: { groupId: "other" } });
    lookup(s, "123");
    expect(s.tasks.A).toMatchObject({ refInfo: info, title: "My title", groupId: "other" });
  });

  it("ignores a lookup for a ref that has since changed", () => {
    const s = withTask();
    run(s, T0, { type: "task.update", taskId: "A", patch: { ref: "456" } });
    lookup(s, "123");
    expect(s.tasks.A!.refInfo ?? null).toBeNull();
    expect(s.tasks.A!.title).toBe("");
  });

  it("clears the info when the ref changes, but not when only its formatting does", () => {
    const s = withTask();
    lookup(s, "123");
    run(s, T0 + 2 * M, { type: "task.update", taskId: "A", patch: { ref: "123" } });
    expect(s.tasks.A!.refInfo).toEqual(info);
    run(s, T0 + 3 * M, { type: "task.update", taskId: "A", patch: { ref: "124" } });
    expect(s.tasks.A!.refInfo).toBeNull();
  });

  it("is safe to apply twice and skips an unknown group", () => {
    const s = withTask();
    lookup(s, "123", "nope");
    lookup(s, "123", "nope");
    expect(s.tasks.A).toMatchObject({ title: "Printer offline", groupId: null, refInfo: info });
  });
});
