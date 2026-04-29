"use client";
import { useEffect, useState } from "react";
import type { ActivityEvent } from "@/lib/types";
import Avatar from "./Avatar";

function describe(e: ActivityEvent): string {
  switch (e.type) {
    case "track_added":
      return `added "${e.payload.trackTitle ?? "a song"}"`;
    case "playlist_added":
      return `added ${e.payload.count ?? 0} songs from "${e.payload.playlistTitle ?? "a playlist"}"`;
    case "track_skipped":
      return e.payload.trackTitle ? `skipped "${e.payload.trackTitle}"` : "skipped a song";
    case "track_removed":
      return `removed "${e.payload.trackTitle ?? "a song"}"`;
    case "tracks_removed":
      return `removed ${e.payload.count ?? 0} songs`;
    case "user_joined":
      return "joined";
    case "user_left":
      return "left";
    default:
      return "";
  }
}

function relativeTime(ts: number, now: number) {
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  // Tick every 30s so relative times refresh
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    return <div className="text-sm text-gray-500">Nothing yet.</div>;
  }

  return (
    <ul className="space-y-2.5 max-h-80 overflow-y-auto">
      {sorted.map((e) => (
        <li key={e.id} className="flex items-start gap-2 text-sm">
          <Avatar pokemonId={e.userPokemonId} size={22} className="mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="leading-snug">
              <span className="font-medium">{e.userName}</span>{" "}
              <span className="text-gray-400">{describe(e)}</span>
            </div>
            <div className="text-xs text-gray-600">{relativeTime(e.timestamp, now)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
