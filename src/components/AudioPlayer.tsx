"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Avatar from "./Avatar";

type FetchUrlResp = { url?: string; error?: string };

type Props = {
  track: {
    videoId: string;
    title: string;
    thumbnail: string;
    addedByName: string;
    addedByPokemonId: number | null;
  } | null;
  playing: boolean;
  positionSec: number;
  serverUpdatedAt: number;
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  hasNext: boolean;
  lyricsActive?: boolean;
  onTogglePlay: () => void;
  onSkip: () => void;
  onSeek: (positionSec: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleLyrics?: () => void;
  onTheaterMode?: () => void;
  onEnded: () => void;
  fetchAudioUrl: (
    videoId: string,
    refresh: boolean,
    cb: (resp: FetchUrlResp) => void
  ) => void;
};

export type AudioPlayerHandle = {
  getCurrentTime: () => number;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SpeakerIcon({ level }: { level: "high" | "low" | "muted" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {level !== "muted" && (
        <>
          {level === "high" && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </>
      )}
      {level === "muted" && (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      )}
    </svg>
  );
}

const PlayIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
);
const PauseIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
const SkipIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5v14l9-7zM16 5h3v14h-3z" /></svg>
);
const ShuffleIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" />
  </svg>
);
const RepeatIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);
const RepeatOneIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    <text x="12" y="14.5" textAnchor="middle" fontSize="7" fontWeight="800" fill="currentColor" stroke="none">1</text>
  </svg>
);
const HeadphonesIcon = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z" />
  </svg>
);
const LyricsIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);
const TheaterIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

const AudioPlayer = forwardRef<AudioPlayerHandle, Props>(function AudioPlayer(
  {
    track,
    playing,
    positionSec,
    serverUpdatedAt,
    shuffle,
    repeat,
    hasNext,
    lyricsActive,
    onTogglePlay,
    onSkip,
    onSeek,
    onToggleShuffle,
    onCycleRepeat,
    onToggleLyrics,
    onTheaterMode,
    onEnded,
    fetchAudioUrl,
  },
  ref
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const lastEndedFiredFor = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [duration, setDuration] = useState(0);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => audioRef.current?.currentTime ?? 0,
  }));

  // Mirror props in a ref so async callbacks (URL fetch, loadedmetadata) can read
  // the LATEST state, not stale closure values from when the request was kicked off.
  const stateRef = useRef({ playing, positionSec, serverUpdatedAt });
  useEffect(() => {
    stateRef.current = { playing, positionSec, serverUpdatedAt };
  }, [playing, positionSec, serverUpdatedAt]);

  // Restore stored volume on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem("mq:volume");
    const m = localStorage.getItem("mq:muted");
    if (v !== null) {
      const parsed = parseFloat(v);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) setVolume(parsed);
    }
    if (m !== null) setMuted(m === "true");
  }, []);

  // Apply volume to audio element + persist
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("mq:volume", String(volume));
      localStorage.setItem("mq:muted", String(muted));
    }
  }, [volume, muted]);

  const videoId = track?.videoId || null;

  function applyState() {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    // Don't act until metadata is ready — otherwise we'd play from 0 while the
    // initial seek is still pending, causing the "starts from beginning then jumps" glitch.
    if (audio.readyState < 1 /* HAVE_METADATA */) return;
    const target = playing
      ? positionSec + (Date.now() - serverUpdatedAt) / 1000
      : positionSec;
    if (Number.isFinite(target) && Math.abs(audio.currentTime - target) > 0.6) {
      try { audio.currentTime = Math.max(0, target); } catch {}
    }
    if (playing && audio.paused) {
      audio.play().catch(() => setNeedsTap(true));
    } else if (!playing && !audio.paused) {
      audio.pause();
    }
  }

  function loadUrl(refresh: boolean) {
    const id = currentVideoIdRef.current;
    if (!id) return;
    setError(null);
    setLoading(true);
    fetchAudioUrl(id, refresh, (resp) => {
      if (currentVideoIdRef.current !== id) return;
      setLoading(false);
      if (resp.error || !resp.url) {
        setError(resp.error || "Could not load audio");
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = resp.url;

      // Seek to the correct server position (not 0) before play. This prevents
      // a brief playback from the start when remounting mid-song (e.g. coming
      // back from host mode). Wait for metadata so the seek is reliable.
      const seekAndPlay = () => {
        const { playing: p, positionSec: pos, serverUpdatedAt: ts } = stateRef.current;
        const startSec = p ? pos + (Date.now() - ts) / 1000 : pos;
        try { audio.currentTime = Math.max(0, startSec); } catch {}
        if (p) audio.play().catch(() => setNeedsTap(true));
      };
      if (audio.readyState >= 1 /* HAVE_METADATA */) {
        seekAndPlay();
      } else {
        const onMeta = () => {
          audio.removeEventListener("loadedmetadata", onMeta);
          seekAndPlay();
        };
        audio.addEventListener("loadedmetadata", onMeta);
      }
    });
  }

  // When videoId changes: reset and fetch
  useEffect(() => {
    if (videoId === currentVideoIdRef.current) return;
    currentVideoIdRef.current = videoId;
    lastEndedFiredFor.current = null;
    setNeedsTap(false);
    setDuration(0);
    setDisplayPosition(0);
    const audio = audioRef.current;
    if (!videoId) {
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      setLoading(false);
      setError(null);
      return;
    }
    loadUrl(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Apply playback state changes
  useEffect(() => {
    applyState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, positionSec, serverUpdatedAt]);

  // Reset the onEnded dedupe whenever the server resets positionSec back to 0.
  // This is what makes repeat-one work past the first loop: server sets positionSec=0
  // for every loop, and we need to allow the next natural-end event to fire again.
  // Otherwise lastEndedFiredFor is stuck at the videoId and all subsequent ends are dropped.
  useEffect(() => {
    if (positionSec < 0.5) {
      lastEndedFiredFor.current = null;
    }
  }, [positionSec, serverUpdatedAt]);

  // Drift correction every 5s while playing
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => applyState(), 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, positionSec, serverUpdatedAt]);

  // Tick displayPosition for the scrubber
  useEffect(() => {
    if (dragValue !== null) return;
    const tick = () => {
      if (audioRef.current && Number.isFinite(audioRef.current.currentTime)) {
        setDisplayPosition(audioRef.current.currentTime);
      }
    };
    tick();
    if (!playing) return;
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [playing, positionSec, serverUpdatedAt, dragValue]);

  const handleAudioError = () => {
    if (currentVideoIdRef.current && !loading) loadUrl(true);
  };

  const handleManualPlay = () => {
    setNeedsTap(false);
    audioRef.current?.play().catch(() => setNeedsTap(true));
  };

  // Scrubber click → seek
  const onScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - r.left) / r.width;
    onSeek(Math.max(0, Math.min(duration, ratio * duration)));
  };

  // Empty state
  if (!track) {
    return (
      <div
        className="now-playing"
        style={{ ["--np-grad-1" as string]: "#2b2d31", ["--np-grad-2" as string]: "#1e1f22" }}
      >
        <div className="np-cover">
          <span className="placeholder">🎧</span>
        </div>
        <div className="np-info">
          <div className="np-eyebrow">{HeadphonesIcon} Nothing playing</div>
          <div className="np-title">Queue is empty</div>
          <div className="np-artist">Search a song or paste a link to start the vibe.</div>
        </div>
      </div>
    );
  }

  const pct = duration > 0 ? Math.min(100, ((dragValue ?? displayPosition) / duration) * 100) : 0;

  return (
    <div className="now-playing">
      <audio
        ref={audioRef}
        preload="auto"
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          setDuration(Number.isFinite(d) ? (d as number) : 0);
        }}
        onEnded={() => {
          const id = currentVideoIdRef.current;
          if (id && lastEndedFiredFor.current !== id) {
            lastEndedFiredFor.current = id;
            onEnded();
          }
        }}
        onError={handleAudioError}
      />

      <div className="np-cover">
        <img src={track.thumbnail} alt="" />
      </div>

      <div className="np-info">
        <div className="np-eyebrow">
          {HeadphonesIcon} Now playing · everyone hears this
        </div>
        <div className="np-title">{track.title}</div>
        <div className="np-artist">added by</div>
        <div className="np-added-by">
          <Avatar pokemonId={track.addedByPokemonId} size={18} />
          <strong style={{ fontWeight: 600 }}>{track.addedByName}</strong>
        </div>

        {loading && <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>Preparing audio…</div>}
        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#fda4af" }}>
            {error} <button
              onClick={() => loadUrl(true)}
              style={{ background: "none", border: 0, color: "white", textDecoration: "underline", cursor: "pointer", marginLeft: 6 }}
            >
              retry
            </button>
          </div>
        )}
        {needsTap && !loading && !error && (
          <button
            onClick={handleManualPlay}
            style={{
              marginTop: 8,
              background: "white", color: "black",
              border: 0, padding: "8px 14px", borderRadius: 999,
              fontWeight: 700, cursor: "pointer", fontSize: 13,
              alignSelf: "flex-start",
            }}
          >
            Tap to start audio
          </button>
        )}

        <div className="np-controls">
          <button
            className={"ctrl" + (shuffle ? " active" : "")}
            onClick={onToggleShuffle}
            title={shuffle ? "Shuffle on" : "Shuffle off"}
          >
            {ShuffleIcon}
          </button>
          <button
            className="ctrl play"
            onClick={onTogglePlay}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? PauseIcon : PlayIcon}
          </button>
          <button
            className="ctrl"
            onClick={onSkip}
            disabled={!hasNext}
            title="Skip"
          >
            {SkipIcon}
          </button>
          <button
            className={"ctrl" + (repeat !== "off" ? " active" : "") + (repeat === "one" ? " repeat-on" : "")}
            onClick={onCycleRepeat}
            title={
              repeat === "off"
                ? "Repeat off"
                : repeat === "all"
                ? "Repeat all"
                : "Repeat one"
            }
          >
            {repeat === "one" ? RepeatOneIcon : RepeatIcon}
          </button>
          {onToggleLyrics && (
            <button
              className={"ctrl" + (lyricsActive ? " active" : "")}
              onClick={onToggleLyrics}
              title={lyricsActive ? "Hide lyrics" : "Show lyrics"}
            >
              {LyricsIcon}
            </button>
          )}

          <div className="np-volume">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="ctrl"
              style={{ width: 32, height: 32 }}
              title={muted ? "Unmute" : "Mute"}
            >
              <SpeakerIcon level={muted || volume === 0 ? "muted" : volume < 0.5 ? "low" : "high"} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                if (v > 0 && muted) setMuted(false);
                if (v === 0) setMuted(true);
              }}
              aria-label="Volume"
            />
          </div>
        </div>

        <div className="np-progress">
          <div className="np-bar" onClick={onScrubberClick}>
            <div className="np-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="np-times">
            <span>{formatTime(dragValue ?? displayPosition)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default AudioPlayer;
