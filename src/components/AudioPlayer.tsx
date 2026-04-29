"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type FetchUrlResp = { url?: string; error?: string };

type Props = {
  videoId: string | null;
  playing: boolean;
  positionSec: number;
  serverUpdatedAt: number;
  onEnded: () => void;
  onSeek: (positionSec: number) => void;
  fetchAudioUrl: (videoId: string, refresh: boolean, cb: (resp: FetchUrlResp) => void) => void;
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
  const common = "w-5 h-5";
  if (level === "muted") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="22" y1="9" x2="16" y2="15" />
        <line x1="16" y1="9" x2="22" y2="15" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {level === "high" && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

const AudioPlayer = forwardRef<AudioPlayerHandle, Props>(function AudioPlayer(
  { videoId, playing, positionSec, serverUpdatedAt, onEnded, onSeek, fetchAudioUrl },
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

  // Restore volume + muted from localStorage on mount
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

  // Apply volume + muted to the audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
    if (typeof window !== "undefined") {
      localStorage.setItem("mq:volume", String(volume));
      localStorage.setItem("mq:muted", String(muted));
    }
  }, [volume, muted]);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => audioRef.current?.currentTime ?? 0,
  }));

  function applyState() {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
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
      if (currentVideoIdRef.current !== id) return; // stale
      setLoading(false);
      if (resp.error || !resp.url) {
        setError(resp.error || "Could not load audio");
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = resp.url;
      try { audio.currentTime = 0; } catch {}
      if (playing) audio.play().catch(() => setNeedsTap(true));
    });
  }

  // When videoId changes: reset and fetch new URL
  useEffect(() => {
    if (videoId === currentVideoIdRef.current) return;
    currentVideoIdRef.current = videoId;
    lastEndedFiredFor.current = null;
    setNeedsTap(false);
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

  // Periodic drift correction
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => applyState(), 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, positionSec, serverUpdatedAt]);

  // Tick displayPosition for the seek bar (only when not dragging)
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
    // URL might have expired or network blip — try once with refresh
    if (currentVideoIdRef.current && !loading) {
      loadUrl(true);
    }
  };

  const handleManualPlay = () => {
    setNeedsTap(false);
    audioRef.current?.play().catch(() => setNeedsTap(true));
  };

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={() => {
          const id = currentVideoIdRef.current;
          if (id && lastEndedFiredFor.current !== id) {
            lastEndedFiredFor.current = id;
            onEnded();
          }
        }}
        onError={handleAudioError}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          setDuration(Number.isFinite(d) ? (d as number) : 0);
        }}
      />
      {videoId && (
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={dragValue ?? displayPosition}
            disabled={!duration}
            onChange={(e) => setDragValue(parseFloat(e.target.value))}
            onPointerUp={() => {
              if (dragValue !== null) {
                onSeek(dragValue);
                setDragValue(null);
              }
            }}
            onKeyUp={() => {
              if (dragValue !== null) {
                onSeek(dragValue);
                setDragValue(null);
              }
            }}
            className="w-full accent-indigo-400 cursor-pointer disabled:cursor-not-allowed"
          />
          <div className="flex justify-between items-center text-xs text-gray-500 font-mono gap-3">
            <span>{formatTime(dragValue ?? displayPosition)}</span>
            <div className="flex items-center gap-2 flex-1 max-w-[180px]">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="text-gray-400 hover:text-white transition-colors"
                title={muted ? "Unmute" : "Mute"}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                <SpeakerIcon
                  level={muted || volume === 0 ? "muted" : volume < 0.5 ? "low" : "high"}
                />
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
                className="flex-1 accent-indigo-400 cursor-pointer"
                aria-label="Volume"
              />
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}
      {loading && (
        <div className="text-sm text-gray-500 flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
          Preparing audio…
        </div>
      )}
      {error && (
        <div className="text-sm text-red-400 flex items-center gap-2">
          <span>Audio failed: {error}</span>
          <button onClick={() => loadUrl(true)} className="underline hover:text-red-300">
            retry
          </button>
        </div>
      )}
      {needsTap && !loading && !error && (
        <button
          onClick={handleManualPlay}
          className="bg-indigo-500 hover:bg-indigo-400 px-4 py-2 rounded-lg font-semibold w-full"
        >
          Tap to start audio
        </button>
      )}
    </div>
  );
});

export default AudioPlayer;
