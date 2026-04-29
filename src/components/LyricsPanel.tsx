"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Lyrics = {
  synced: string | null;
  plain: string | null;
  title?: string | null;
  artist?: string | null;
};

type Props = {
  videoId: string | null;
  getCurrentTime: () => number;
  fetchLyrics: (videoId: string, cb: (resp: { lyrics: Lyrics | null }) => void) => void;
};

interface LyricsLine {
  time: number;
  text: string;
}

function parseLRC(text: string): LyricsLine[] {
  const out: LyricsLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // A single LRC line can have multiple timestamps prefixed (e.g., for choruses):
    //   [00:12.34][01:24.56]Same chorus line
    // Iterate all timestamps and emit one entry per timestamp.
    const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
    const stamps: number[] = [];
    let lastEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const min = parseInt(m[1], 10);
      const sec = parseFloat(m[2]);
      stamps.push(min * 60 + sec);
      lastEnd = m.index + m[0].length;
    }
    if (stamps.length === 0) continue;
    const text = raw.slice(lastEnd).trim();
    for (const t of stamps) out.push({ time: t, text });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

export default function LyricsPanel({ videoId, getCurrentTime, fetchLyrics }: Props) {
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!videoId) {
      setLyrics(null);
      setLoading(false);
      return;
    }
    setLyrics(null);
    setLoading(true);
    setActiveIdx(-1);
    const myReqId = ++reqIdRef.current;
    fetchLyrics(videoId, (resp) => {
      if (myReqId !== reqIdRef.current) return;
      setLoading(false);
      setLyrics(resp?.lyrics || null);
    });
  }, [videoId, fetchLyrics]);

  const syncedLines = useMemo(
    () => (lyrics?.synced ? parseLRC(lyrics.synced) : null),
    [lyrics]
  );
  const plainLines = useMemo(
    () => (lyrics?.plain ? lyrics.plain.split(/\r?\n/) : null),
    [lyrics]
  );

  // Tick every 250ms to update active line
  useEffect(() => {
    if (!syncedLines || syncedLines.length === 0) return;
    const tick = () => {
      const t = getCurrentTime();
      // Binary search would be nicer; linear is fine for ~100 lines.
      let idx = -1;
      for (let i = 0; i < syncedLines.length; i++) {
        if (syncedLines[i].time <= t + 0.25) idx = i;
        else break;
      }
      setActiveIdx(idx);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [syncedLines, getCurrentTime]);

  // Auto-scroll active line into the middle of the panel
  useEffect(() => {
    const list = listRef.current;
    const target = activeLineRef.current;
    if (!list || !target) return;
    const targetTop = target.offsetTop - list.offsetTop;
    const desiredScroll = targetTop - list.clientHeight / 2 + target.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, desiredScroll), behavior: "smooth" });
  }, [activeIdx]);

  if (!videoId) {
    return <div className="lyrics-empty">Add a song to see lyrics here.</div>;
  }
  if (loading) {
    return <div className="lyrics-empty">Loading lyrics…</div>;
  }
  if (!lyrics || (!syncedLines && !plainLines)) {
    return (
      <div className="lyrics-empty">
        <div style={{ fontSize: 36, marginBottom: 8 }}>𝅘𝅥𝅮</div>
        <div>No lyrics found for this track.</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
          via lrclib.net — only popular songs are indexed.
        </div>
      </div>
    );
  }

  return (
    <div className="lyrics-wrap">
      {(lyrics.title || lyrics.artist) && (
        <div className="lyrics-meta">
          {lyrics.title && <strong>{lyrics.title}</strong>}
          {lyrics.title && lyrics.artist && " · "}
          {lyrics.artist}
        </div>
      )}
      <div className="lyrics-list scroll" ref={listRef}>
        {syncedLines ? (
          syncedLines.map((line, i) => (
            <div
              key={i}
              ref={i === activeIdx ? activeLineRef : null}
              className={
                "lyrics-line" +
                (i === activeIdx ? " active" : "") +
                (i < activeIdx ? " past" : "")
              }
            >
              {line.text || "♪"}
            </div>
          ))
        ) : plainLines ? (
          plainLines.map((line, i) => (
            <div key={i} className="lyrics-line plain">
              {line || " "}
            </div>
          ))
        ) : null}
      </div>
      <div className="lyrics-attribution">
        {syncedLines ? "Synced lyrics" : "Plain lyrics"} · lrclib.net
      </div>
    </div>
  );
}
