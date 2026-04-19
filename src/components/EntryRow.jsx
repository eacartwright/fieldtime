import { useState } from "react";
import { formatTimestamp, toDatetimeLocal, fromDatetimeLocal } from "../utils";
import { supabase } from "../supabase";

export default function EntryRow({ entry, onUpdate, onDelete }) {
  const [editingBody, setEditingBody] = useState(false);
  const [bodyVal, setBodyVal] = useState(entry.body);
  const [editingTime, setEditingTime] = useState(false);
  const [timeVal, setTimeVal] = useState(toDatetimeLocal(entry.noted_at));

  const commitBody = async () => {
    const body = bodyVal.trim();
    if (body && body !== entry.body) {
      await supabase.from("entries").update({ body }).eq("id", entry.id);
      onUpdate({ ...entry, body });
    }
    setEditingBody(false);
  };

  const commitTime = async () => {
    const noted_at = fromDatetimeLocal(timeVal);
    if (noted_at && noted_at !== entry.noted_at) {
      await supabase.from("entries").update({ noted_at }).eq("id", entry.id);
      onUpdate({ ...entry, noted_at });
    }
    setEditingTime(false);
  };

  return (
    <div style={{
      background: "#111",
      border: "1px solid #1e1e1e",
      borderRadius: 4,
      padding: "10px 12px",
      marginBottom: 8
    }}>
      {/* Timestamp row */}
      <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
        {editingTime ? (
          <input
            type="datetime-local"
            value={timeVal}
            onChange={e => setTimeVal(e.target.value)}
            onBlur={commitTime}
            onKeyDown={e => { if (e.key === "Enter") commitTime(); if (e.key === "Escape") setEditingTime(false); }}
            autoFocus
            style={{
              background: "#1a1a1a",
              border: "1px solid #c86022",
              borderRadius: 3,
              color: "#e8e0d5",
              fontSize: 11,
              padding: "3px 6px",
              fontFamily: "'DM Mono', monospace"
            }}
          />
        ) : (
          <span
            onClick={() => setEditingTime(true)}
            style={{
              fontSize: 11,
              color: "#c86022",
              cursor: "pointer",
              letterSpacing: "0.06em"
            }}
          >
            {formatTimestamp(entry.noted_at)}
          </span>
        )}
        <button
          onClick={() => onDelete(entry.id)}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            color: "#333",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 2px"
          }}
        >✕</button>
      </div>

      {/* Body */}
      {editingBody ? (
        <textarea
          value={bodyVal}
          onChange={e => setBodyVal(e.target.value)}
          onBlur={commitBody}
          onKeyDown={e => { if (e.key === "Escape") setEditingBody(false); }}
          autoFocus
          rows={4}
          style={{
            width: "100%",
            background: "#1a1a1a",
            border: "1px solid #c86022",
            borderRadius: 3,
            color: "#e8e0d5",
            fontSize: 13,
            padding: "8px",
            fontFamily: "'DM Mono', monospace",
            resize: "vertical",
            lineHeight: 1.6
          }}
        />
      ) : (
        <div
          onClick={() => setEditingBody(true)}
          style={{
            fontSize: 13,
            color: entry.body ? "#aaa" : "#444",
            cursor: "pointer",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            minHeight: 20
          }}
        >
          {entry.body || "tap to add notes..."}
        </div>
      )}
    </div>
  );
}