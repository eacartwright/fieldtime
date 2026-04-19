import { useState } from "react";
import { formatDuration, formatForCW, genId } from "../utils";
import { supabase } from "../supabase";
import SessionRow from "./SessionRow";
import EntryRow from "./EntryRow";
import ExportModal from "./ExportModal";

export default function TaskCard({
  task,
  sessions,
  entries,
  isActive,
  activeStart,
  tick,
  onStart,
  onPause,
  onStop,
  onArchive,
  onDelete,
  onUpdateTask,
  onUpdateSession,
  onUpdateEntry,
  onAddSession,
  onAddEntry,
  onDeleteEntry,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(task.name);
  const [newEntryBody, setNewEntryBody] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);

  const getTotalElapsed = () => {
    const sessionTotal = sessions.reduce((acc, s) => {
      const end = (isActive && s.ended_at === null) ? Date.now() : s.ended_at;
      if (!end) return acc;
      return acc + Math.max(0, end - s.started_at);
    }, 0);
    return sessionTotal;
  };

  const activeSession = sessions.find(s => s.ended_at === null);

  const commitName = async () => {
    const name = nameVal.trim();
    if (name && name !== task.name) {
      await supabase.from("tasks").update({ name }).eq("id", task.id);
      onUpdateTask({ ...task, name });
    }
    setEditingName(false);
  };

  const handleAddEntry = async () => {
    const body = newEntryBody.trim();
    const entry = {
      id: genId(),
      task_id: task.id,
      body,
      noted_at: Date.now(),
      created_at: Date.now()
    };
    setNewEntryBody("");
    setAddingEntry(false);
    await supabase.from("entries").insert(entry);
    onAddEntry(entry);
  };

  const handleDeleteEntry = async (entryId) => {
    await supabase.from("entries").delete().eq("id", entryId);
    onDeleteEntry(entryId);
  };

  const isStopped = task.status === "stopped";
  const elapsed = getTotalElapsed();

  return (
    <>
      <div style={{
        borderBottom: "1px solid #1c1c1c",
        borderLeft: isActive ? "3px solid #c86022" : "3px solid transparent",
        background: isActive ? "#141008" : "transparent",
      }}>
        {/* Main row */}
        <div style={{ padding: "14px 20px" }}>
          {/* Name row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            {editingName ? (
              <input
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={commitName}
                onKeyDown={e => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                autoFocus
                style={{
                  flex: 1, background: "transparent", border: "none",
                  borderBottom: "1.5px solid #c86022",
                  color: "#e8e0d5", fontSize: 15, padding: "2px 0",
                  fontFamily: "'DM Mono', monospace", outline: "none"
                }}
              />
            ) : (
              <div
                onDoubleClick={() => setEditingName(true)}
                style={{
                  flex: 1, fontSize: 14,
                  color: isStopped ? "#555" : "#ccc",
                  letterSpacing: "0.03em", wordBreak: "break-word",
                  cursor: "text"
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

            {/* Expand toggle */}
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                background: "transparent", border: "none",
                color: expanded ? "#c86022" : "#444",
                fontSize: 16, cursor: "pointer", padding: "2px 4px",
                fontFamily: "'Barlow Condensed', sans-serif",
                letterSpacing: "0.05em", fontSize: 11
              }}
            >
              {expanded ? "LESS" : "MORE"}
            </button>
          </div>

          {/* Timer + controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className={isActive ? "pulse" : ""} style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 32, fontWeight: 700,
              letterSpacing: "0.06em",
              color: isActive ? "#e87a30" : elapsed > 0 ? "#e8e0d5" : "#333",
              minWidth: 120, lineHeight: 1,
              fontVariantNumeric: "tabular-nums"
            }}>
              {formatDuration(elapsed)}
            </div>

            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              {!isStopped && (
                <button
                  className="btn"
                  onClick={() => isActive ? onPause() : onStart(task.id)}
                  style={{
                    width: 42, height: 42, borderRadius: 4,
                    background: isActive ? "#2a2010" : "#c86022",
                    border: isActive ? "1.5px solid #c86022" : "none",
                    color: isActive ? "#c86022" : "#0f0f0f",
                    fontSize: 18, display: "flex",
                    alignItems: "center", justifyContent: "center"
                  }}
                >
                  {isActive ? "⏸" : "▶"}
                </button>
              )}
              <button
              onClick={() => setExpanded(v => !v)}
              style={{
                  background: "transparent", border: "none",
                  color: expanded ? "#c86022" : "#444",
                  fontSize: 22, cursor: "pointer", padding: "2px 4px",
                  lineHeight: 1
              }}
              >
              {expanded ? "↑" : "↓"}
              </button>
              <button
                className="btn"
                onClick={() => setShowExport(true)}
                style={{
                  width: 42, height: 42, borderRadius: 4,
                  background: "#1a1a1a", border: "1.5px solid #2a2a2a",
                  color: "#666", fontSize: 13, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: "0.05em"
                }}
              >EXP</button>
            </div>
          </div>

          {/* CW hint */}
          {elapsed > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#555", letterSpacing: "0.08em" }}>
              CW: {formatForCW(elapsed)}
            </div>
          )}
        </div>

        {/* Expanded section */}
        {expanded && (
          <div style={{ padding: "0 20px 16px" }}>

            {/* Sessions */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10, color: "#555",
                letterSpacing: "0.1em", marginBottom: 8
              }}>SESSIONS</div>
              {sessions.length === 0 && (
                <div style={{ fontSize: 12, color: "#333" }}>No sessions yet.</div>
              )}
              {[...sessions]
                .sort((a, b) => a.started_at - b.started_at)
                .map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    isActive={isActive && s.ended_at === null}
                    activeStart={activeStart}
                    onUpdate={onUpdateSession}
                  />
                ))}
            </div>

            {/* Entries */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 10, color: "#555",
                letterSpacing: "0.1em", marginBottom: 8
              }}>NOTES</div>
              {entries.length === 0 && !addingEntry && (
                <div style={{ fontSize: 12, color: "#333", marginBottom: 8 }}>No notes yet.</div>
              )}
              {[...entries]
                .sort((a, b) => a.noted_at - b.noted_at)
                .map(e => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    onUpdate={onUpdateEntry}
                    onDelete={handleDeleteEntry}
                  />
                ))}

              {/* New entry form */}
              {addingEntry ? (
                <div style={{
                  background: "#111",
                  border: "1px solid #c86022",
                  borderRadius: 4,
                  padding: "10px 12px"
                }}>
                  <textarea
                    value={newEntryBody}
                    onChange={e => setNewEntryBody(e.target.value)}
                    placeholder="Type your notes here..."
                    autoFocus
                    rows={4}
                    style={{
                      width: "100%", background: "transparent",
                      border: "none", color: "#e8e0d5",
                      fontSize: 13, fontFamily: "'DM Mono', monospace",
                      resize: "vertical", lineHeight: 1.6,
                      outline: "none"
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      className="btn"
                      onClick={handleAddEntry}
                      style={{
                        background: "#c86022", color: "#0f0f0f",
                        border: "none", borderRadius: 3,
                        padding: "7px 16px",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 13, fontWeight: 700, letterSpacing: "0.08em"
                      }}
                    >SAVE</button>
                    <button
                      className="btn"
                      onClick={() => { setAddingEntry(false); setNewEntryBody(""); }}
                      style={{
                        background: "transparent", color: "#555",
                        border: "1px solid #2a2a2a", borderRadius: 3,
                        padding: "7px 16px",
                        fontFamily: "'Barlow Condensed', sans-serif",
                        fontSize: 13, letterSpacing: "0.08em"
                      }}
                    >CANCEL</button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn"
                  onClick={() => setAddingEntry(true)}
                  style={{
                    background: "transparent",
                    border: "1px dashed #2a2a2a",
                    borderRadius: 4, color: "#555",
                    padding: "8px 14px", width: "100%",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 12, letterSpacing: "0.08em",
                    cursor: "pointer"
                  }}
                >+ ADD NOTE</button>
              )}
            </div>

            {/* Task actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn"
                onClick={() => onArchive(task.id)}
                style={{
                  flex: 1, background: "transparent",
                  border: "1px solid #2a2a2a", borderRadius: 3,
                  color: "#555", padding: "8px",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 12, letterSpacing: "0.08em"
                }}
              >ARCHIVE</button>
              <button
                className="btn"
                onClick={() => onDelete(task.id)}
                style={{
                  flex: 1, background: "transparent",
                  border: "1px solid #2a2a2a", borderRadius: 3,
                  color: "#555", padding: "8px",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 12, letterSpacing: "0.08em"
                }}
              >DELETE</button>
            </div>
          </div>
        )}
      </div>

      {showExport && (
        <ExportModal
          task={task}
          sessions={sessions}
          entries={entries}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  );
}