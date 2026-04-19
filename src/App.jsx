import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { genId } from "./utils";
import { theme } from "./theme";
import TaskCard from "./components/TaskCard";

const SESSION_KEY = "fieldtime-session";

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [activeStart, setActiveStart] = useState(null);
  const [tick, setTick] = useState(0);
  const [newName, setNewName] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    async function fetchAll() {
      const [tasksRes, sessionsRes, entriesRes] = await Promise.all([
        supabase.from("tasks").select("*").order("position", { ascending: true }),
        supabase.from("sessions").select("*").order("started_at", { ascending: true }),
        supabase.from("entries").select("*").order("noted_at", { ascending: true }),
      ]);
      if (tasksRes.data) setTasks(tasksRes.data);
      if (sessionsRes.data) setSessions(sessionsRes.data);
      if (entriesRes.data) setEntries(entriesRes.data);
      setLoading(false);
    }
    fetchAll();

    const session = loadSession();
    if (session) {
      setActiveId(session.id);
      setActiveStart(session.start);
    }

    const taskChannel = supabase
      .channel("tasks-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, payload => {
        if (payload.eventType === "INSERT") {
          setTasks(prev => prev.find(t => t.id === payload.new.id) ? prev : [...prev, payload.new]);
        } else if (payload.eventType === "UPDATE") {
          setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        } else if (payload.eventType === "DELETE") {
          setTasks(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe(status => console.log("tasks channel:", status));

    const sessionChannel = supabase
      .channel("sessions-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, payload => {
        if (payload.eventType === "INSERT") {
          setSessions(prev => prev.find(s => s.id === payload.new.id) ? prev : [...prev, payload.new]);
        } else if (payload.eventType === "UPDATE") {
          setSessions(prev => prev.map(s => s.id === payload.new.id ? payload.new : s));
        } else if (payload.eventType === "DELETE") {
          setSessions(prev => prev.filter(s => s.id !== payload.old.id));
        }
      })
      .subscribe(status => console.log("sessions channel:", status));

    const entryChannel = supabase
      .channel("entries-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, payload => {
        if (payload.eventType === "INSERT") {
          setEntries(prev => prev.find(e => e.id === payload.new.id) ? prev : [...prev, payload.new]);
        } else if (payload.eventType === "UPDATE") {
          setEntries(prev => prev.map(e => e.id === payload.new.id ? payload.new : e));
        } else if (payload.eventType === "DELETE") {
          setEntries(prev => prev.filter(e => e.id !== payload.old.id));
        }
      })
      .subscribe(status => console.log("entries channel:", status));

    return () => {
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(entryChannel);
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeId]);

  const startTask = async (taskId) => {
    const now = Date.now();
    if (activeId && activeStart) {
      const activeSession = sessions.find(s => s.task_id === activeId && s.ended_at === null);
      if (activeSession) {
        await supabase.from("sessions").update({ ended_at: now }).eq("id", activeSession.id);
        setSessions(prev => prev.map(s =>
          s.id === activeSession.id ? { ...s, ended_at: now } : s
        ));
      }
      await supabase.from("tasks").update({ status: "paused" }).eq("id", activeId);
      setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: "paused" } : t));
    }

    const newSession = {
      id: genId(),
      task_id: taskId,
      started_at: now,
      ended_at: null,
      created_at: now
    };
    await supabase.from("sessions").insert(newSession);
    setSessions(prev => [...prev, newSession]);
    await supabase.from("tasks").update({ status: "running" }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "running" } : t));
    setActiveId(taskId);
    setActiveStart(now);
    saveSession({ id: taskId, start: now });
  };

  const pauseTask = async () => {
    if (!activeId) return;
    const now = Date.now();
    const activeSession = sessions.find(s => s.task_id === activeId && s.ended_at === null);
    if (activeSession) {
      await supabase.from("sessions").update({ ended_at: now }).eq("id", activeSession.id);
      setSessions(prev => prev.map(s =>
        s.id === activeSession.id ? { ...s, ended_at: now } : s
      ));
    }
    await supabase.from("tasks").update({ status: "paused" }).eq("id", activeId);
    setTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: "paused" } : t));
    setActiveId(null);
    setActiveStart(null);
    saveSession(null);
  };

  const stopTask = async (taskId) => {
    const now = Date.now();
    const isActive = taskId === activeId;
    if (isActive) {
      const activeSession = sessions.find(s => s.task_id === taskId && s.ended_at === null);
      if (activeSession) {
        await supabase.from("sessions").update({ ended_at: now }).eq("id", activeSession.id);
        setSessions(prev => prev.map(s =>
          s.id === activeSession.id ? { ...s, ended_at: now } : s
        ));
      }
      setActiveId(null);
      setActiveStart(null);
      saveSession(null);
    }
    await supabase.from("tasks").update({ status: "stopped" }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "stopped" } : t));
  };

  const archiveTask = async (taskId) => {
    if (taskId === activeId) await pauseTask();
    await supabase.from("tasks").update({ archived: true }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, archived: true } : t));
  };

  const deleteTask = async (taskId) => {
    if (taskId === activeId) {
      setActiveId(null);
      setActiveStart(null);
      saveSession(null);
    }
    await supabase.from("tasks").delete().eq("id", taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSessions(prev => prev.filter(s => s.task_id !== taskId));
    setEntries(prev => prev.filter(e => e.task_id !== taskId));
  };

  const addTask = async () => {
    const name = newName.trim();
    if (!name) return;
    const task = {
      id: genId(),
      name,
      elapsed: 0,
      status: "idle",
      created: Date.now(),
      position: tasks.filter(t => !t.archived).length,
      archived: false
    };
    setTasks(prev => [...prev, task]);
    setNewName("");
    inputRef.current?.focus();
    await supabase.from("tasks").insert(task);
  };

  const activeTasks = tasks.filter(t => !t.archived);
  const archivedTasks = tasks.filter(t => t.archived);
  const displayTasks = showArchive ? archivedTasks : activeTasks;

  if (loading) return (
    <div style={{
      minHeight: "100dvh", background: theme.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Mono', monospace", color: theme.textDead,
      fontSize: 13, letterSpacing: "0.1em"
    }}>LOADING...</div>
  );

  return (
    <div style={{
      minHeight: "100dvh",
      background: theme.bg,
      color: theme.textPrimary,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      maxWidth: 480,
      margin: "0 auto",
      paddingBottom: 80,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Barlow+Condensed:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; padding: 0; background: ${theme.bg}; }
        .btn { cursor: pointer; border: none; transition: transform 0.12s; user-select: none; }
        .btn:active { transform: scale(0.92); }
        .pulse { animation: pulse 1.8s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .slide-in { animation: slidein 0.18s ease-out; }
        @keyframes slidein { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        input, textarea { outline: none; -webkit-appearance: none; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: `2px solid ${theme.accent}`,
        padding: "18px 20px 14px",
        position: "sticky", top: 0,
        background: theme.bg,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 26, fontWeight: 800,
            letterSpacing: "0.04em", lineHeight: 1,
            color: theme.textPrimary
          }}>FIELD TIME</div>
          <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 3, letterSpacing: "0.1em" }}>
            {showArchive
              ? `${archivedTasks.length} ARCHIVED TASK${archivedTasks.length !== 1 ? "S" : ""}`
              : `${activeTasks.length} ACTIVE TASK${activeTasks.length !== 1 ? "S" : ""}`}
          </div>
        </div>
        <button
          className="btn"
          onClick={() => setShowArchive(v => !v)}
          style={{
            background: showArchive ? theme.accent : "transparent",
            border: `1.5px solid ${theme.accent}`,
            color: showArchive ? theme.bg : theme.accent,
            padding: "7px 14px", borderRadius: 3,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.08em"
          }}
        >
          {showArchive ? "ACTIVE" : "ARCHIVE"}
        </button>
      </div>

      {/* Task list */}
      <div style={{ padding: "12px 0" }}>
        {displayTasks.length === 0 && (
          <div style={{
            padding: "48px 24px", textAlign: "center",
            color: theme.textDead, fontSize: 13,
            lineHeight: 1.8, letterSpacing: "0.05em"
          }}>
            {showArchive ? "NO ARCHIVED TASKS" : "NO TASKS YET"}<br />
            <span style={{ fontSize: 11 }}>
              {showArchive ? "ARCHIVED TASKS WILL APPEAR HERE" : "ADD ONE BELOW TO START TRACKING"}
            </span>
          </div>
        )}

        {displayTasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            sessions={sessions.filter(s => s.task_id === task.id)}
            entries={entries.filter(e => e.task_id === task.id)}
            isActive={activeId === task.id}
            activeStart={activeStart}
            tick={tick}
            onStart={startTask}
            onPause={pauseTask}
            onStop={stopTask}
            onArchive={archiveTask}
            onDelete={deleteTask}
            onUpdateTask={updated => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))}
            onUpdateSession={updated => setSessions(prev => prev.map(s => s.id === updated.id ? updated : s))}
            onUpdateEntry={updated => setEntries(prev => prev.map(e => e.id === updated.id ? updated : e))}
            onAddSession={session => setSessions(prev => [...prev, session])}
            onAddEntry={entry => setEntries(prev => [...prev, entry])}
            onDeleteEntry={entryId => setEntries(prev => prev.filter(e => e.id !== entryId))}
            onDeleteSession={sessionId => setSessions(prev => prev.filter(s => s.id !== sessionId))}
          />
        ))}
      </div>

      {/* Add task bar */}
      {!showArchive && (
        <div style={{
          position: "fixed", bottom: 0,
          left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 480,
          background: theme.bg,
          borderTop: `2px solid ${theme.border}`,
          padding: "14px 16px",
          display: "flex", gap: 10, zIndex: 100
        }}>
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTask(); }}
            placeholder="New task name..."
            style={{
              flex: 1, background: theme.bgInput,
              border: `1.5px solid ${theme.borderMid}`, borderRadius: 4,
              color: theme.textPrimary, padding: "12px 14px",
              fontSize: 14, fontFamily: "'DM Mono', monospace"
            }}
          />
          <button
            className="btn"
            onClick={addTask}
            disabled={!newName.trim()}
            style={{
              background: newName.trim() ? theme.accent : theme.bgCard,
              color: newName.trim() ? theme.bg : theme.textInactive,
              border: "none", borderRadius: 4,
              padding: "0 20px", fontSize: 16, fontWeight: 700,
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: "0.05em"
            }}
          >ADD</button>
        </div>
      )}
    </div>
  );
}