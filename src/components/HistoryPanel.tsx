"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ActivityEvent } from "@/lib/types";

const ICONS: Record<string, ReactNode> = {
  added: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  removed: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  skipped: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5v14l9-7zM16 5h3v14h-3z" /></svg>
  ),
  played: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
  ),
  joined: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    </svg>
  ),
  left: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    </svg>
  ),
  paused: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
  ),
  resumed: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
  ),
  seeked: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h14" /><path d="m13 6 6 6-6 6" />
    </svg>
  ),
  reordered: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h13M3 12h9M3 18h13" /><path d="m17 15 4 3-4 3" />
    </svg>
  ),
};

function fmtSec(sec?: number): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relTime(ts: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function describe(e: ActivityEvent): { verb: string; song?: string; extra?: string } {
  switch (e.type) {
    case "track_added":
      return { verb: "added", song: e.payload.trackTitle };
    case "playlist_added":
      return { verb: `added ${e.payload.count ?? 0} songs from`, song: e.payload.playlistTitle };
    case "track_skipped":
      return { verb: "skipped", song: e.payload.trackTitle };
    case "track_removed":
      return { verb: "removed", song: e.payload.trackTitle };
    case "tracks_removed":
      return { verb: `removed ${e.payload.count ?? 0} songs` };
    case "user_joined":
      return { verb: "joined the radio" };
    case "user_left":
      return { verb: "left" };
    case "paused": {
      const at = fmtSec(e.payload.positionSec);
      return { verb: "paused", song: e.payload.trackTitle, extra: at ? ` at ${at}` : undefined };
    }
    case "resumed": {
      const at = fmtSec(e.payload.positionSec);
      return { verb: "resumed", song: e.payload.trackTitle, extra: at ? ` at ${at}` : undefined };
    }
    case "seeked": {
      const from = fmtSec(e.payload.fromSec);
      const to = fmtSec(e.payload.toSec);
      const extra = from && to ? ` from ${from} → ${to}` : to ? ` to ${to}` : undefined;
      return { verb: "scrubbed", song: e.payload.trackTitle, extra };
    }
    case "queue_reordered": {
      const { fromIdx, toIdx } = e.payload;
      if (fromIdx !== undefined && toIdx !== undefined) {
        const dir = toIdx < fromIdx ? "up" : "down";
        return {
          verb: `moved`,
          song: e.payload.trackTitle,
          extra: ` ${dir} (#${fromIdx} → #${toIdx})`,
        };
      }
      return { verb: "reordered the queue" };
    }
  }
}

function typeClass(t: ActivityEvent["type"]): string {
  switch (t) {
    case "track_added":
    case "playlist_added":
      return "added";
    case "track_removed":
    case "tracks_removed":
      return "removed";
    case "track_skipped":
      return "skipped";
    case "user_joined":
      return "joined";
    case "user_left":
      return "left";
    case "paused":
      return "paused";
    case "resumed":
      return "resumed";
    case "seeked":
      return "seeked";
    case "queue_reordered":
      return "reordered";
  }
}

function iconKey(t: ActivityEvent["type"]): string {
  switch (t) {
    case "track_added":
    case "playlist_added":
      return "added";
    case "track_removed":
    case "tracks_removed":
      return "removed";
    case "track_skipped":
      return "skipped";
    case "user_joined":
      return "joined";
    case "user_left":
      return "left";
    case "paused":
      return "paused";
    case "resumed":
      return "resumed";
    case "seeked":
      return "seeked";
    case "queue_reordered":
      return "reordered";
  }
}

export default function HistoryPanel({ events }: { events: ActivityEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);

  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    return (
      <div className="right-body scroll" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No activity yet.
      </div>
    );
  }

  return (
    <div className="right-body scroll">
      {sorted.map((e) => {
        const { verb, song, extra } = describe(e);
        return (
          <div key={e.id} className={`history-event ${typeClass(e.type)}`}>
            <div className="icon">{ICONS[iconKey(e.type)]}</div>
            <div className="body">
              <span className="who">{e.userName}</span>{" "}
              <span className="what">{verb}</span>
              {song && <> <span className="song">"{song}"</span></>}
              {extra && <span className="extra">{extra}</span>}
            </div>
            <div className="time">{relTime(e.timestamp, now)}</div>
          </div>
        );
      })}
    </div>
  );
}
