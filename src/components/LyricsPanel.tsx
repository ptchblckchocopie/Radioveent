"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Lyrics = {
  synced: string | null;
  plain: string | null;
  title?: string | null;
  artist?: string | null;
  source?: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  lrclib: "lrclib.net",
  netease: "NetEase Music",
  genius: "Genius",
  "lyrics.ovh": "lyrics.ovh",
};

type Props = {
  videoId: string | null;
  getCurrentTime: () => number;
  fetchLyrics: (
    videoId: string,
    refresh: boolean,
    cb: (resp: { lyrics: Lyrics | null }) => void
  ) => void;
  onSeek?: (timeSec: number) => void;
};

interface LyricsLine {
  time: number;
  text: string;
}

function parseLRC(text: string): LyricsLine[] {
  const out: LyricsLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
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

export default function LyricsPanel({ videoId, getCurrentTime, fetchLyrics, onSeek }: Props) {
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [reloadKey, setReloadKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reqIdRef = useRef(0);
  const forceNextRef = useRef(false);
  const lastVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastVideoIdRef.current !== videoId) {
      lastVideoIdRef.current = videoId;
      forceNextRef.current = false;
    }
    if (!videoId) {
      setLyrics(null);
      setLoading(false);
      return;
    }
    setLyrics(null);
    setLoading(true);
    setActiveIdx(-1);
    const myReqId = ++reqIdRef.current;
    const refresh = forceNextRef.current;
    forceNextRef.current = false;
    fetchLyrics(videoId, refresh, (resp) => {
      if (myReqId !== reqIdRef.current) return;
      setLoading(false);
      setLyrics(resp?.lyrics || null);
    });
  }, [videoId, fetchLyrics, reloadKey]);

  const handleRetry = () => {
    forceNextRef.current = true;
    setReloadKey((k) => k + 1);
  };

  const syncedLines = useMemo(
    () => (lyrics?.synced ? parseLRC(lyrics.synced) : null),
    [lyrics]
  );
  const plainLines = useMemo(
    () => (lyrics?.plain ? lyrics.plain.split(/\r?\n/) : null),
    [lyrics]
  );

  // Tick every 100ms to update active line. The previous 250ms cadence meant
  // two users' ticks could fall up to 250ms apart inside the same beat, so the
  // same line could appear "active" at noticeably different moments on each
  // screen. 100ms collapses that jitter to ≤100ms cross-user. Lookahead drops
  // from 0.25 to 0.10 to match — large lookahead made lines fire early to
  // hide tick latency, but with a faster tick we don't need to compensate.
  useEffect(() => {
    if (!syncedLines || syncedLines.length === 0) return;
    const tick = () => {
      const t = getCurrentTime();
      let idx = -1;
      for (let i = 0; i < syncedLines.length; i++) {
        if (syncedLines[i].time <= t + 0.1) idx = i;
        else break;
      }
      setActiveIdx(idx);
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [syncedLines, getCurrentTime]);

  // Auto-scroll active line to center. Compute via getBoundingClientRect so the
  // math doesn't depend on .lyrics-scroller being the offsetParent — el.offsetTop
  // would otherwise resolve against whichever ancestor happens to be positioned,
  // making the active line land at random scroll positions.
  useEffect(() => {
    const el = lineRefs.current[activeIdx];
    const sc = listRef.current;
    if (!el || !sc) return;
    const elRect = el.getBoundingClientRect();
    const scRect = sc.getBoundingClientRect();
    const lineTopWithinContent = elRect.top - scRect.top + sc.scrollTop;
    const target = lineTopWithinContent - sc.clientHeight / 2 + el.clientHeight / 2;
    sc.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeIdx]);

  if (!videoId) {
    return (
      <div className="lyrics-empty">
        <div className="lyrics-empty-icon">♫</div>
        <div>Add a song to see lyrics here.</div>
      </div>
    );
  }
  if (loading) {
    return <div className="lyrics-empty">Loading lyrics…</div>;
  }
  if (!lyrics || (!syncedLines && !plainLines)) {
    return (
      <div className="lyrics-empty">
        <div className="lyrics-empty-icon">♫</div>
        <div className="lyrics-empty-title">No lyrics yet</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
          We don't have synced lyrics for this song.
        </div>
        <button type="button" className="lyrics-retry" onClick={handleRetry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="lyrics-wrap">
      <div className="lyrics-scroller scroll" ref={listRef}>
        <div className="lyrics-pad" />
        {syncedLines ? (
          syncedLines.map((line, i) => {
            const dist = Math.abs(i - activeIdx);
            const isActive = i === activeIdx;
            const isPast = i < activeIdx;
            const isEmpty = !line.text;
            const opacity = isActive ? 1 : Math.max(0.18, 1 - dist * 0.18);
            return (
              <div
                key={i}
                ref={(el) => { lineRefs.current[i] = el; }}
                className={
                  "lyrics-line" +
                  (isActive ? " active" : "") +
                  (isPast ? " past" : "") +
                  (isEmpty ? " empty" : "")
                }
                style={{ opacity }}
                onClick={() => onSeek?.(line.time)}
              >
                {line.text || "·"}
              </div>
            );
          })
        ) : plainLines ? (
          plainLines.map((line, i) => (
            <div key={i} className="lyrics-line plain">
              {line || " "}
            </div>
          ))
        ) : null}
        <div className="lyrics-pad" />
      </div>
      <div className="lyrics-attribution">
        <span>
          {syncedLines ? "Synced lyrics" : "Plain lyrics"}
          {lyrics.source ? ` · ${SOURCE_LABEL[lyrics.source] || lyrics.source}` : ""}
        </span>
        <button
          type="button"
          className="lyrics-retry-link"
          onClick={handleRetry}
          title="Re-match this track against lrclib"
        >
          Wrong song? Try again
        </button>
      </div>
    </div>
  );
}
