import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

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

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
}

function formatForCW(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const decimal = (h + m / 60).toFixed(2);
  return `${decimal} hrs (${h}h ${m}m)`;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [activeStart, setActiveStart] = useState(null);
  const [tick, setTick] = useState(0);
  const [newName, setNewName] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const inputRef = useRef(null);
  const editRef = useRef(null);

  // Load tasks from Supabase on mount
  useEffect(() => {
    async function fetchTasks() {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("position", { ascending: true });
      if (!error && data) setTasks(data);
      setLoading(false);
    }
    fetchTasks();

    // Restore active session
    const session = loadSession();
    if (session) {
      setActiveId(session.id);
      setActiveStart(session.start);
    }

    // Real-time subscription
    const channel = supabase
      .channel("tasks-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setTasks(prev => {
              if (prev.find(t => t.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } else if (payload.eventType === "UPDATE") {
            setTasks(prev => prev.map(t =>
              t.id === payload.new.id ? payload.new : t
            ));
          } else if (payload.eventType === "DELETE") {
            setTasks(prev => prev.filter(t => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Tick
  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeId]);

  const getLiveElapsed = useCallback((task) => {
    if (activeId === task.id && activeStart) {
      return task.elapsed + (Date.now() - activeStart);
    }
    return task.elapsed;
  }, [activeId, activeStart, tick]); // eslint-disable-line

  const stopActive = useCallback((tasksArr) => {
    if (!activeId || !activeStart) return tasksArr;
    const now = Date.now();
    return tasksArr.map(t =>
      t.id === activeId
        ? { ...t, elapsed: t.elapsed + (now - activeStart) }
        : t
    );
  }, [activeId, activeStart]);

  const upsertTask = async (task) => {
    await supabase.from("tasks").upsert(task);
  };

  const startTask = (id) => {
    const now = Date.now();
    setTasks(prev => {
      const stopped = stopActive(prev);
      const updated = stopped.map(t =>
        t.id === id ? { ...t, status: "running" } :
        t.id === activeId ? { ...t, status: t.elapsed > 0 ? "paused" : "idle" } : t
      );
      // Persist affected tasks
      updated.filter(t => t.id === id || t.id === activeId).forEach(upsertTask);
      return updated;
    });
    setActiveId(id);
    setActiveStart(now);
    saveSession({ id, start: now });
  };

  const pauseTask = () => {
    setTasks(prev => {
      const stopped = stopActive(prev);
      const updated = stopped.map(t =>
        t.id === activeId ? { ...t, status: "paused" } : t
      );
      const affected = updated.find(t => t.id === activeId);
      if (affected) upsertTask(affected);
      return updated;
    });
    setActiveId(null);
    setActiveStart(null);
    saveSession(null);
  };

  const stopTask = (id) => {
    const isActive = id === activeId;
    setTasks(prev => {
      const arr = isActive ? stopActive(prev) : prev;
      const updated = arr.map(t => t.id === id ? { ...t, status: "stopped" } : t);
      const affected = updated.find(t => t.id === id);
      if (affected) upsertTask(affected);
      return updated;
    });
    if (isActive) {
      setActiveId(null);
      setActiveStart(null);
      saveSession(null);
    }
  };

  const resetTask = (id) => {
    if (id === activeId) {
      setActiveId(null);
      setActiveStart(null);
      saveSession(null);
    }
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === id ? { ...t, elapsed: 0, status: "idle" } : t
      );
      const affected = updated.find(t => t.id === id);
      if (affected) upsertTask(affected);
      return updated;
    });
  };

  const deleteTask = async (id) => {
    if (id === activeId) {
      setActiveId(null);
      setActiveStart(null);
      saveSession(null);
    }
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  };

  const addTask = async () => {
    const name = newName.trim();
    if (!name) return;
    const task = {
      id: `t-${Date.now()}`,
      name,
      elapsed: 0,
      status: "idle",
      created: Date.now(),
      position: tasks.length
    };
    setTasks(prev => [...prev, task]);
    setNewName("");
    inputRef.current?.focus();
    await upsertTask(task);
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditingName(task.name);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const commitEdit = async () => {
    const name = editingName.trim();
    if (name) {
      setTasks(prev => prev.map(t =>
        t.id === editingId ? { ...t, name } : t
      ));
      await supabase.from("tasks").update({ name }).eq("id", editingId);
    }
    setEditingId(null);
  };

  const buildExport = () => {
    const date = new Date().toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric"
    });
    const lines = tasks
      .filter(t => getLiveElapsed(t) > 0)
      .map(t => `• ${t.name}\n  ${formatForCW(getLiveElapsed(t))}`);
    return `Field Time Log — ${date}\n${"─".repeat(32)}\n${lines.join("\n\n")}`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildExport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const activeTasks = tasks.filter(t => getLiveElapsed(t) > 0);

  if (loading) return (
    <div style={{
      minHeight: "100dvh", background: "#0f0f0f",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Mono', monospace", color: "#444",
      fontSize: 13, letterSpacing: "0.1em"
    }}>
      LOADING...
    </div>
  );

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0f0f0f",
      color: "#e8e0d5",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      maxWidth: 480,
      margin: "0 auto",
      paddingBottom: 80,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Barlow+Condensed:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        .btn { cursor: pointer; border: none; transition: transform 0.12s; user-select: none; }
        .btn:active { transform: scale(0.92); }
        .pulse { animation: pulse 1.8s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .slide-in { animation: slidein 0.18s ease-out; }
        @keyframes slidein { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        input { outline: none; -webkit-appearance: none; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "2px solid #c86022",
        padding: "18px 20px 14px",
        position: "sticky", top: 0,
        background: "#0f0f0f",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 26, fontWeight: 800,
            letterSpacing: "0.04em", lineHeight: 1
          }}>FIELDTIME</div>
          <div style={{ fontSize: 10, color: "#666", marginTop: 3, letterSpacing: "0.1em" }}>
            {activeTasks.length > 0
              ? `${activeTasks.length} TASK${activeTasks.length > 1 ? "S" : ""} LOGGED`
              : "NO TASKS LOGGED"}
          </div>
        </div>
        {activeTasks.length > 0 && (
          <button className="btn" onClick={() => setShowExport(v => !v)} style={{
            background: showExport ? "#c86022" : "transparent",
            border: "1.5px solid #c86022",
            color: showExport ? "#0f0f0f" : "#c86022",
            padding: "7px 14px", borderRadius: 3,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: "0.08em"
          }}>
            {showExport ? "CLOSE" : "EXPORT"}
          </button>
        )}
      </div>

      {/* Export panel */}
      {showExport && (
        <div className="slide-in" style={{
          background: "#161616",
          borderBottom: "1px solid #2a2a2a",
          padding: "16px 20px"
        }}>
          <pre style={{
            background: "#0a0a0a",
            border: "1px solid #2a2a2a",
            borderRadius: 4, padding: 14,
            fontSize: 12, lineHeight: 1.7,
            color: "#aaa", margin: 0,
            whiteSpace: "pre-wrap", wordBreak: "break-word"
          }}>{buildExport()}</pre>
          <button className="btn" onClick={handleCopy} style={{
            marginTop: 12, width: "100%",
            background: copied ? "#2a5a2a" : "#c86022",
            color: copied ? "#8fbc8f" : "#0f0f0f",
            padding: 12, borderRadius: 3,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 15, fontWeight: 700, letterSpacing: "0.1em", border: "none"
          }}>
            {copied ? "✓ COPIED" : "COPY FOR CONNECTWISE"}
          </button>
        </div>
      )}

      {/* Task list */}
      <div style={{ padding: "12px 0" }}>
        {tasks.length === 0 && (
          <div style={{
            padding: "48px 24px", textAlign: "center",
            color: "#444", fontSize: 13, lineHeight: 1.8, letterSpacing: "0.05em"
          }}>
            NO TASKS YET<br />
            <span style={{ fontSize: 11 }}>ADD ONE BELOW TO START TRACKING</span>
          </div>
        )}

        {tasks.map(task => {
          const isRunning = activeId === task.id;
          const elapsed = getLiveElapsed(task);
          const isEditing = editingId === task.id;
          const isStopped = task.status === "stopped";
          const hasSomeTime = elapsed > 0;

          return (
            <div key={task.id} className="slide-in" style={{
              borderBottom: "1px solid #1c1c1c",
              padding: "14px 20px",
              background: isRunning ? "#141008" : "transparent",
              borderLeft: isRunning ? "3px solid #c86022" : "3px solid transparent"
            }}>
              {/* Name row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                {isEditing ? (
                  <input
                    ref={editRef}
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{
                      flex: 1, background: "transparent", border: "none",
                      borderBottom: "1.5px solid #c86022",
                      color: "#e8e0d5", fontSize: 15, padding: "2px 0",
                      fontFamily: "'DM Mono', monospace"
                    }}
                  />
                ) : (
                  <div
                    onDoubleClick={() => !isStopped && startEdit(task)}
                    style={{
                      flex: 1, fontSize: 14,
                      color: isStopped ? "#555" : "#ccc",
                      letterSpacing: "0.03em", wordBreak: "break-word"
                    }}
                  >
                    {task.name}
                    {isStopped && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: "#444", letterSpacing: "0.1em" }}>
                        DONE
                      </span>
                    )}
                  </div>
                )}
                <button className="btn" onClick={() => deleteTask(task.id)} style={{
                  background: "transparent", color: "#333",
                  fontSize: 16, padding: "2px 4px", borderRadius: 3
                }}>✕</button>
              </div>

              {/* Timer + controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className={isRunning ? "pulse" : ""} style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 32, fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: isRunning ? "#e87a30" : hasSomeTime ? "#e8e0d5" : "#333",
                  minWidth: 120, lineHeight: 1,
                  fontVariantNumeric: "tabular-nums"
                }}>
                  {formatDuration(elapsed)}
                </div>

                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  {!isStopped && (
                    <button className="btn" onClick={() => isRunning ? pauseTask() : startTask(task.id)} style={{
                      width: 42, height: 42, borderRadius: 4,
                      background: isRunning ? "#2a2010" : "#c86022",
                      border: isRunning ? "1.5px solid #c86022" : "none",
                      color: isRunning ? "#c86022" : "#0f0f0f",
                      fontSize: 18, display: "flex",
                      alignItems: "center", justifyContent: "center"
                    }}>
                      {isRunning ? "⏸" : "▶"}
                    </button>
                  )}
                  {!isStopped && hasSomeTime && (
                    <button className="btn" onClick={() => stopTask(task.id)} style={{
                      width: 42, height: 42, borderRadius: 4,
                      background: "#1a1a1a", border: "1.5px solid #333",
                      color: "#888", fontSize: 16, display: "flex",
                      alignItems: "center", justifyContent: "center"
                    }}>⏹</button>
                  )}
                  {hasSomeTime && (
                    <button className="btn" onClick={() => resetTask(task.id)} style={{
                      width: 42, height: 42, borderRadius: 4,
                      background: "#1a1a1a", border: "1.5px solid #222",
                      color: "#555", fontSize: 18, display: "flex",
                      alignItems: "center", justifyContent: "center"
                    }}>↺</button>
                  )}
                </div>
              </div>

              {hasSomeTime && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#555", letterSpacing: "0.08em" }}>
                  CW: {formatForCW(elapsed)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add task bar */}
      <div style={{
        position: "fixed", bottom: 0,
        left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480,
        background: "#0f0f0f",
        borderTop: "2px solid #1c1c1c",
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
            flex: 1, background: "#191919",
            border: "1.5px solid #2a2a2a", borderRadius: 4,
            color: "#e8e0d5", padding: "12px 14px",
            fontSize: 14, fontFamily: "'DM Mono', monospace"
          }}
        />
        <button className="btn" onClick={addTask} disabled={!newName.trim()} style={{
          background: newName.trim() ? "#c86022" : "#1a1a1a",
          color: newName.trim() ? "#0f0f0f" : "#333",
          border: "none", borderRadius: 4,
          padding: "0 20px", fontSize: 16, fontWeight: 700,
          fontFamily: "'Barlow Condensed', sans-serif",
          letterSpacing: "0.05em"
        }}>ADD</button>
      </div>
    </div>
  );
}