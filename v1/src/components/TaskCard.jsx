import { useState } from "react";
import { formatDuration, formatForCW, genId } from "../utils";
import { supabase } from "../supabase";
import { theme } from "../theme";
import SessionRow from "./SessionRow";
import EntryRow from "./EntryRow";
import ExportModal from "./ExportModal";

export default function TaskCard({
  task, sessions, entries,
  isActive, activeStart, tick,
  onStart, onPause, onStop,
  onArchive, onDelete,
  onUpdateTask, onUpdateSession, onUpdateEntry,
  onAddSession, onAddEntry, onDeleteEntry, onDeleteSession,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(task.name);
  const [newEntryBody, setNewEntryBody] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);

  const getTotalElapsed = () => {
    return sessions.reduce((acc, s) => {
      const end = (isActive && s.ended_at === null) ? Date.now() : s.ended_at;
      if (!end) return acc;
      return acc + Math.max(0, end - s.started_at);
    }, 0);
  };

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

  const handleDeleteSession = async (sessionId) => {
    await supabase.from("sessions").delete().eq("id", sessionId);
    onDeleteSession(sessionId);
  };

  const isStopped = task.status === "stopped";
  const elapsed = getTotalElapsed();

  return (
    <>
      <div style={{
        borderBottom: `1px solid ${theme.border}`,
        borderLeft: isActive ? `3px solid ${theme.accent}` : "3px solid transparent",
        background: isActive ? theme.accentDim : "transparent",
      }}>
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
                  borderBottom: `1.5px solid ${theme.accent}`,
                  color: theme.textPrimary, fontSize: 15, padding: "2px 0",
                  fontFamily: "'DM Mono', monospace", outline: "none"
                }}
              />
            ) : (
              <div
                onDoubleClick={() => setEditingName(true)}
                style={{
                  flex: 1, fontSize: 14,
                  color: isStopped ? theme.textFaint : theme.textMid,
                  letterSpacing: "0.03em", wordBreak: "break-word", cursor: "text"
                }}
              >
                {task.name}
                {isStopped && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: theme.textDead, letterSpacing: "0.1em" }}>
                    DONE
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Timer + controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className={isActive ? "pulse" : ""} style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 32, fontWeight: 700, letterSpacing: "0.06em",
              color: isActive ? theme.accentWarm : elapsed > 0 ? theme.textPrimary : theme.textInactive,
              minWidth: 120, lineHeight: 1, fontVariantNumeric: "tabular-nums"
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
                    background: isActive ? theme.accentDim : theme.accent,
                    border: isActive ? `1.5px solid ${theme.accent}` : "none",
                    color: isActive ? theme.accent : theme.bg,
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
                  width: 42, height: 42, borderRadius: 4,
                  background: theme.bgCard,
                  border: `1.5px solid ${theme.borderMid}`,
                  color: expanded ? theme.accent : theme.textMuted,
                  fontSize: 20, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  cursor: "pointer"
                }}
              >
                {expanded ? "↑" : "↓"}
              </button>
              <button
                className="btn"
                onClick={() => setShowExport(true)}
                style={{
                  width: 42, height: 42, borderRadius: 4,
                  background: theme.bgCard, border: `1.5px solid ${theme.borderMid}`,
                  color: theme.textMuted, fontSize: 20, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  letterSpacing: "0.05em"
                }}
              >⇒</button>
            </div>
          </div>

          {elapsed > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: theme.textFaint, letterSpacing: "0.08em" }}>
              CW: {formatForCW(elapsed)}
            </div>
          )}
        </div>

        {/* Expanded section */}
        {expanded && (
          <div style={{ padding: "0 20px 16px" }}>
            {/* Sessions */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: theme.textFaint, letterSpacing: "0.1em", marginBottom: 8 }}>
                SESSIONS
              </div>
              {sessions.length === 0 && (
                <div style={{ fontSize: 12, color: theme.textInactive }}>No sessions yet.</div>
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
                    onDelete={handleDeleteSession}
                  />
                ))}
            </div>

            {/* Entries */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: theme.textFaint, letterSpacing: "0.1em", marginBottom: 8 }}>
                NOTES
              </div>
              {entries.length === 0 && !addingEntry && (
                <div style={{ fontSize: 12, color: theme.textInactive, marginBottom: 8 }}>No notes yet.</div>
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

              {addingEntry ? (
                <div style={{
                  background: theme.bgCard,
                  border: `1px solid ${theme.accent}`,
                  borderRadius: 4, padding: "10px 12px"
                }}>
                  <textarea
                    value={newEntryBody}
                    onChange={e => setNewEntryBody(e.target.value)}
                    placeholder="Type your notes here..."
                    autoFocus
                    rows={4}
                    style={{
                      width: "100%", background: "transparent",
                      border: "none", color: theme.textPrimary,
                      fontSize: 13, fontFamily: "'DM Mono', monospace",
                      resize: "vertical", lineHeight: 1.6, outline: "none"
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      className="btn"
                      onClick={handleAddEntry}
                      style={{
                        background: theme.accent, color: theme.bg,
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
                        background: "transparent", color: theme.textFaint,
                        border: `1px solid ${theme.borderMid}`, borderRadius: 3,
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
                    border: `1px dashed ${theme.borderMid}`,
                    borderRadius: 4, color: theme.textFaint,
                    padding: "8px 14px", width: "100%",
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 12, letterSpacing: "0.08em", cursor: "pointer"
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
                  border: `1px solid ${theme.borderMid}`, borderRadius: 3,
                  color: theme.textFaint, padding: "8px",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 12, letterSpacing: "0.08em"
                }}
              >ARCHIVE</button>
              <button
                className="btn"
                onClick={() => onDelete(task.id)}
                style={{
                  flex: 1, background: "transparent",
                  border: `1px solid ${theme.borderMid}`, borderRadius: 3,
                  color: theme.textFaint, padding: "8px",
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