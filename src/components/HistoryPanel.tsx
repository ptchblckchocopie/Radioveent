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
};

function relTime(ts: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function describe(e: ActivityEvent): { verb: string; song?: string } {
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
        const { verb, song } = describe(e);
        return (
          <div key={e.id} className={`history-event ${typeClass(e.type)}`}>
            <div className="icon">{ICONS[iconKey(e.type)]}</div>
            <div className="body">
              <span className="who">{e.userName}</span>{" "}
              <span className="what">{verb}</span>
              {song && <> <span className="song">"{song}"</span></>}
            </div>
            <div className="time">{relTime(e.timestamp, now)}</div>
          </div>
        );
      })}
    </div>
  );
}
