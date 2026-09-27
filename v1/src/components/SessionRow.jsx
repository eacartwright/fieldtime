import { useState } from "react";
import { formatDuration, formatTimestamp, toDatetimeLocal, fromDatetimeLocal } from "../utils";
import { supabase } from "../supabase";
import { theme } from "../theme";

export default function SessionRow({ session, isActive, activeStart, onUpdate, onDelete }) {
  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);
  const [startVal, setStartVal] = useState(toDatetimeLocal(session.started_at));
  const [endVal, setEndVal] = useState(toDatetimeLocal(session.ended_at));

  const commitStart = async () => {
    const started_at = fromDatetimeLocal(startVal);
    if (started_at && started_at !== session.started_at) {
      await supabase.from("sessions").update({ started_at }).eq("id", session.id);
      onUpdate({ ...session, started_at });
    }
    setEditingStart(false);
  };

  const commitEnd = async () => {
    const ended_at = fromDatetimeLocal(endVal);
    if (ended_at && ended_at !== session.ended_at) {
      await supabase.from("sessions").update({ ended_at }).eq("id", session.id);
      onUpdate({ ...session, ended_at });
    }
    setEditingEnd(false);
  };

  const getSessionDuration = () => {
    const end = isActive ? Date.now() : session.ended_at;
    if (!end) return 0;
    return Math.max(0, end - session.started_at);
  };

  const inputStyle = {
    background: theme.bgInput,
    border: `1px solid ${theme.accent}`,
    borderRadius: 3,
    color: theme.textPrimary,
    fontSize: 11,
    padding: "3px 6px",
    fontFamily: "'DM Mono', monospace"
  };

  const labelStyle = {
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer"
  };

  return (
    <div style={{
      background: theme.bgCard,
      border: `1px solid ${theme.borderMid}`,
      borderRadius: 4,
      padding: "10px 12px",
      marginBottom: 8,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }}>
      {/* Start time */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: theme.textFaint, letterSpacing: "0.1em", minWidth: 36 }}>START</span>
        {editingStart ? (
          <input
            type="datetime-local"
            value={startVal}
            onChange={e => setStartVal(e.target.value)}
            onBlur={commitStart}
            onKeyDown={e => { if (e.key === "Enter") commitStart(); if (e.key === "Escape") setEditingStart(false); }}
            autoFocus
            style={inputStyle}
          />
        ) : (
          <span onClick={() => setEditingStart(true)} style={{ ...labelStyle, color: theme.textPrimary }}>
            {formatTimestamp(session.started_at)}
          </span>
        )}
        {!isActive && (
          <button
            onClick={() => onDelete(session.id)}
            style={{
              marginLeft: "auto", background: "transparent",
              border: "none", color: theme.textInactive,
              cursor: "pointer", fontSize: 14, padding: "0 2px"
            }}
          >✕</button>
        )}
      </div>

      {/* End time */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: theme.textFaint, letterSpacing: "0.1em", minWidth: 36 }}>END</span>
        {isActive ? (
          <span style={{ ...labelStyle, color: theme.accent }}>running...</span>
        ) : editingEnd ? (
          <input
            type="datetime-local"
            value={endVal}
            onChange={e => setEndVal(e.target.value)}
            onBlur={commitEnd}
            onKeyDown={e => { if (e.key === "Enter") commitEnd(); if (e.key === "Escape") setEditingEnd(false); }}
            autoFocus
            style={inputStyle}
          />
        ) : (
          <span
            onClick={() => session.ended_at && setEditingEnd(true)}
            style={{ ...labelStyle, color: session.ended_at ? theme.textPrimary : theme.textDead }}
          >
            {session.ended_at ? formatTimestamp(session.ended_at) : "—"}
          </span>
        )}
      </div>

      {/* Duration */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: theme.textFaint, letterSpacing: "0.1em", minWidth: 36 }}>DUR</span>
        <span style={{ fontSize: 11, color: theme.textMuted, fontVariantNumeric: "tabular-nums" }}>
          {formatDuration(getSessionDuration())}
        </span>
      </div>
    </div>
  );
}