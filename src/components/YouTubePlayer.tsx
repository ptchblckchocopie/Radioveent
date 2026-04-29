"use client";
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Props = {
  videoId: string | null;
  playing: boolean;
  positionSec: number;
  serverUpdatedAt: number;
  onEnded: () => void;
  hidden?: boolean;
};

export type YouTubePlayerHandle = {
  getCurrentTime: () => number;
};

let apiLoadingPromise: Promise<void> | null = null;
function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiLoadingPromise) return apiLoadingPromise;
  apiLoadingPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiLoadingPromise;
}

const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  { videoId, playing, positionSec, serverUpdatedAt, onEnded, hidden },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const lastEndedFiredFor = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => {
      try {
        return playerRef.current?.getCurrentTime?.() ?? 0;
      } catch {
        return 0;
      }
    },
  }));

  const initStartedRef = useRef(false);

  // Lazily initialize the player once videoId becomes non-null
  useEffect(() => {
    if (!videoId || initStartedRef.current) return;
    initStartedRef.current = true;
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        videoId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            currentVideoIdRef.current = videoId;
            applyState();
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              const ended = currentVideoIdRef.current;
              if (ended && lastEndedFiredFor.current !== ended) {
                lastEndedFiredFor.current = ended;
                onEnded();
              }
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
      readyRef.current = false;
      initStartedRef.current = false;
    };
  }, []);

  // Load new video when videoId changes (after player exists).
  // Always start at 0 — server resets positionSec on track change, but the
  // playback_update may not have rendered yet. The applyState effect below
  // will seek to the correct position on the next render if it's non-zero
  // (e.g. someone reconnected mid-song).
  useEffect(() => {
    if (!readyRef.current || !playerRef.current) return;
    if (videoId === currentVideoIdRef.current) return;
    currentVideoIdRef.current = videoId;
    lastEndedFiredFor.current = null;
    if (!videoId) {
      try { playerRef.current.stopVideo?.(); } catch {}
      return;
    }
    try {
      if (playing) {
        playerRef.current.loadVideoById({ videoId, startSeconds: 0 });
      } else {
        playerRef.current.cueVideoById({ videoId, startSeconds: 0 });
      }
    } catch {}
  }, [videoId, playing]);

  // Apply playback state when it changes
  function applyState() {
    if (!readyRef.current || !playerRef.current) return;
    try {
      const target = playing
        ? positionSec + (Date.now() - serverUpdatedAt) / 1000
        : positionSec;
      const current = playerRef.current.getCurrentTime?.() ?? 0;
      if (Math.abs(current - target) > 0.6) {
        playerRef.current.seekTo(Math.max(0, target), true);
      }
      const state = playerRef.current.getPlayerState?.();
      const PLAYING = window.YT?.PlayerState?.PLAYING ?? 1;
      const PAUSED = window.YT?.PlayerState?.PAUSED ?? 2;
      if (playing && state !== PLAYING) {
        playerRef.current.playVideo?.();
      } else if (!playing && state === PLAYING) {
        playerRef.current.pauseVideo?.();
      } else if (!playing && state !== PAUSED) {
        // Cued/buffering — leave alone
      }
    } catch {}
  }

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
  }, [playing, serverUpdatedAt, positionSec]);

  return (
    <div className={hidden ? "absolute -left-[9999px] w-px h-px overflow-hidden" : "w-full aspect-video bg-black rounded-lg overflow-hidden"}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
});

export default YouTubePlayer;
