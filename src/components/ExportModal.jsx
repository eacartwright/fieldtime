import { useState } from "react";
import { formatDuration, formatForCW, formatDateOnly, formatTimestamp } from "../utils";

export default function ExportModal({ task, sessions, entries, onClose }) {
  const [copied, setCopied] = useState(false);

  const totalElapsed = sessions.reduce((acc, s) => {
    if (!s.ended_at) return acc;
    return acc + Math.max(0, s.ended_at - s.started_at);
  }, 0);

  const buildExport = () => {
    const lines = [];

    lines.push(`TASK: ${task.name}`);
    lines.push("─".repeat(40));

    // Group sessions by date
    const sortedSessions = [...sessions].sort((a, b) => a.started_at - b.started_at);

    sortedSessions.forEach(s => {
      const start = new Date(s.started_at).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true
      });
      const end = s.ended_at
        ? new Date(s.ended_at).toLocaleString("en-US", {
            hour: "numeric", minute: "2-digit", hour12: true
          })
        : "running";
      const dur = s.ended_at
        ? formatDuration(s.ended_at - s.started_at)
        : "";
      lines.push(`SESSION: ${start} → ${end}${dur ? `  (${dur})` : ""}`);
    });

    lines.push("");
    lines.push(`TOTAL: ${formatForCW(totalElapsed)}`);

    if (entries.length > 0) {
      lines.push("");
      lines.push("NOTES:");
      const sortedEntries = [...entries].sort((a, b) => a.noted_at - b.noted_at);
      sortedEntries.forEach(e => {
        lines.push(`[${formatTimestamp(e.noted_at)}]`);
        lines.push(e.body);
        lines.push("");
      });
    }

    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildExport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.85)",
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        background: "#161616",
        border: "1px solid #2a2a2a",
        borderRadius: 8,
        width: "100%",
        maxWidth: 480,
        maxHeight: "80dvh",
        display: "flex",
        flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0
        }}>
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 16, fontWeight: 700,
              letterSpacing: "0.08em", color: "#e8e0d5"
            }}>EXPORT</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{task.name}</div>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none",
            color: "#555", fontSize: 20, cursor: "pointer"
          }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
          <pre style={{
            background: "#0a0a0a",
            border: "1px solid #2a2a2a",
            borderRadius: 4, padding: 14,
            fontSize: 12, lineHeight: 1.7,
            color: "#aaa", margin: 0,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: "'DM Mono', monospace"
          }}>{buildExport()}</pre>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid #2a2a2a", flexShrink: 0 }}>
          <button onClick={handleCopy} style={{
            width: "100%",
            background: copied ? "#2a5a2a" : "#c86022",
            color: copied ? "#8fbc8f" : "#0f0f0f",
            border: "none", borderRadius: 4,
            padding: 14,
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 15, fontWeight: 700,
            letterSpacing: "0.1em", cursor: "pointer"
          }}>
            {copied ? "✓ COPIED" : "COPY FOR CONNECTWISE"}
          </button>
        </div>
      </div>
    </div>
  );
}