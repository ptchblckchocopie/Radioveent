"use client";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ActivityEvent,
  ChatMessage,
  Mode,
  Playback,
  RepeatMode,
  RoomSnapshot,
  Track,
  User,
} from "@/lib/types";
import AudioPlayer, { type AudioPlayerHandle } from "./AudioPlayer";
import SearchOverlay from "./SearchOverlay";
import { type SearchResult, type TrackStatus } from "./SearchBar";
import SortableQueueItem from "./SortableQueueItem";
import PokemonPicker from "./PokemonPicker";
import Avatar from "./Avatar";
import ChatPanel from "./ChatPanel";
import HistoryPanel from "./HistoryPanel";
import LyricsPanel from "./LyricsPanel";
import ShareButton from "./ShareButton";
import VeentLogo from "./VeentLogo";
import { POKEMON } from "@/lib/pokemon";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

function getStoredName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mq:name") || "";
}
function setStoredName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("mq:name", name);
}
function getStoredPokemonId(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem("mq:pokemonId");
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 1025 ? n : null;
}
function setStoredPokemonId(id: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem("mq:pokemonId", String(id));
}

const POKEMON_LIST = POKEMON;
function randomPokemonId() {
  return POKEMON_LIST[Math.floor(Math.random() * POKEMON_LIST.length)].id;
}

const SettingsIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const HashIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </svg>
);
const SearchIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const HeadphonesSmall = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z" />
  </svg>
);
const ChatTabIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const HistoryTabIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 3" />
  </svg>
);
const LyricsTabIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);
const CrownIcon = (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z" />
  </svg>
);
const PlayCtrlIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
);
const PauseCtrlIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);

function formatTheaterTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getTrackGradient(_thumbnail: string): string {
  // Use a warm gradient that matches the design's pink/purple vibe
  return "#5865f2 0%, #1e1f22 100%";
}

// Theater-mode lyrics component — renders 3 lines at most: prev, current (large), next
function TheaterLyrics({
  videoId,
  getCurrentTime,
  fetchLyrics,
}: {
  videoId: string;
  getCurrentTime: () => number;
  fetchLyrics: (
    videoId: string,
    refresh: boolean,
    cb: (resp: { lyrics: { synced: string | null; plain: string | null } | null }) => void
  ) => void;
}) {
  const [lyrics, setLyrics] = React.useState<{ synced: string | null; plain: string | null } | null>(null);
  const [activeIdx, setActiveIdx] = React.useState(-1);
  const reqIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!videoId) { setLyrics(null); return; }
    setLyrics(null);
    const myReq = ++reqIdRef.current;
    fetchLyrics(videoId, false, (resp) => {
      if (myReq !== reqIdRef.current) return;
      setLyrics(resp?.lyrics || null);
    });
  }, [videoId, fetchLyrics]);

  const syncedLines = React.useMemo(() => {
    if (!lyrics?.synced) return null;
    const out: { time: number; text: string }[] = [];
    for (const raw of lyrics.synced.split(/\r?\n/)) {
      const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
      const stamps: number[] = [];
      let lastEnd = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) {
        stamps.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
        lastEnd = m.index + m[0].length;
      }
      if (stamps.length === 0) continue;
      const text = raw.slice(lastEnd).trim();
      for (const t of stamps) out.push({ time: t, text });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
  }, [lyrics]);

  React.useEffect(() => {
    if (!syncedLines || syncedLines.length === 0) return;
    const tick = () => {
      const t = getCurrentTime();
      let idx = -1;
      for (let i = 0; i < syncedLines.length; i++) {
        if (syncedLines[i].time <= t + 0.25) idx = i;
        else break;
      }
      setActiveIdx(idx);
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [syncedLines, getCurrentTime]);

  if (!syncedLines || syncedLines.length === 0) {
    return <div className="theater-lyrics-empty">No synced lyrics available</div>;
  }

  // Render the whole synced list. The stack slides via translateY so the active line
  // sits at the body's vertical center; each line transitions its own size/opacity/blur
  // based on data-offset. Stable React keys (line index) let CSS transitions actually fire
  // — the previous "3 fixed slots" layout swapped text content in place, which CSS can't animate.
  const idx = Math.max(0, activeIdx);
  return (
    <div
      className="theater-lyrics-stack"
      style={{ ["--active" as string]: idx } as React.CSSProperties}
    >
      {syncedLines.map((line, i) => (
        <div
          key={i}
          className="theater-stack-line"
          data-offset={i - idx}
        >
          {line.text || "♪"}
        </div>
      ))}
    </div>
  );
}

function TheaterControls({
  playing,
  getCurrentTime,
  onTogglePlay,
  onSkip,
}: {
  playing: boolean;
  getCurrentTime: () => number;
  duration: number;
  onTogglePlay: () => void;
  onSkip: () => void;
}) {
  const [time, setTime] = React.useState(0);
  React.useEffect(() => {
    const tick = () => setTime(getCurrentTime());
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [getCurrentTime]);

  return (
    <div className="theater-controls">
      <span className="theater-time">{formatTheaterTime(time)}</span>
      <div className="theater-btns">
        <button className="theater-ctrl play" onClick={onTogglePlay}>
          {playing ? PauseCtrlIcon : PlayCtrlIcon}
        </button>
        <button className="theater-ctrl" onClick={onSkip}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5v14l9-7zM16 5h3v14h-3z" /></svg>
        </button>
      </div>
      <span className="theater-time" />
    </div>
  );
}

export default function RoomClient({
  roomId,
  initialRoomName,
  initialPlaceId,
}: {
  roomId: string;
  initialRoomName?: string;
  initialPlaceId?: string;
}) {
  // Identity / join gate
  const [name, setName] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [pokemonId, setPokemonId] = useState<number | null>(null);
  const [pickedPokemonId, setPickedPokemonId] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);

  // Room state
  const [mode, setMode] = useState<Mode>("synced");
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [youUserId, setYouUserId] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playback, setPlayback] = useState<Playback>({
    playing: false,
    positionSec: 0,
    serverUpdatedAt: Date.now(),
  });
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [takenIds, setTakenIds] = useState<number[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>("");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [rightTab, setRightTab] = useState<"chat" | "history">("chat");
  const [unreadChat, setUnreadChat] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"main" | "users" | "chat" | "history">("main");

  const socketRef = useRef<Socket | null>(null);
  const playerRef = useRef<AudioPlayerHandle>(null);

  // Restore stored name + Pokémon on mount
  useEffect(() => {
    const stored = getStoredName();
    if (stored) {
      setName(stored);
      setNameInput(stored);
    }
    const storedPid = getStoredPokemonId();
    setPickedPokemonId(storedPid ?? randomPokemonId());
  }, []);

  // Auto-shuffle pokemon if it gets taken
  useEffect(() => {
    if (joined) return;
    if (!pickedPokemonId) return;
    if (takenIds.includes(pickedPokemonId)) {
      const taken = new Set(takenIds);
      const available = POKEMON_LIST.filter((p) => !taken.has(p.id));
      if (available.length > 0) {
        const next = available[Math.floor(Math.random() * available.length)].id;
        setPickedPokemonId(next);
        setPickError("That Pokémon was just taken — picked another at random.");
      }
    }
  }, [takenIds, pickedPokemonId, joined]);

  // Open socket once on mount, set up listeners
  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("room_state", (snap: RoomSnapshot) => {
      setMode(snap.mode);
      setHostUserId(snap.hostUserId);
      setYouUserId(snap.youUserId);
      setUsers(snap.users);
      setQueue(snap.queue);
      setCurrent(snap.current);
      setPlayback(snap.playback);
      setActivity(snap.activity || []);
      setChat(snap.chat || []);
      setRoomName(snap.name || `Room ${snap.id}`);
      setPlaceId(snap.placeId || null);
      setShuffle(!!snap.shuffle);
      setRepeat(snap.repeat || "off");
    });
    socket.on("room_place_updated", ({ placeId }: { placeId: string | null }) => {
      setPlaceId(placeId);
    });
    socket.on("activity_added", (e: ActivityEvent) => {
      setActivity((prev) => {
        const next = [...prev, e];
        return next.length > 50 ? next.slice(-50) : next;
      });
    });
    socket.on("chat_message", (m: ChatMessage) => {
      setChat((prev) => {
        const next = [...prev, m];
        return next.length > 100 ? next.slice(-100) : next;
      });
    });
    socket.on("room_name_updated", ({ name }: { name: string }) => setRoomName(name));
    socket.on("users_updated", (u: User[]) => setUsers(u));
    socket.on("queue_updated", ({ queue, current }: { queue: Track[]; current: Track | null }) => {
      setQueue(queue);
      setCurrent(current);
    });
    socket.on("playback_update", (p: Playback) => setPlayback(p));
    socket.on("mode_changed", ({ mode, hostUserId }: { mode: Mode; hostUserId: string | null }) => {
      setMode(mode);
      setHostUserId(hostUserId);
    });
    socket.on(
      "playback_settings_updated",
      ({ shuffle, repeat }: { shuffle: boolean; repeat: RepeatMode }) => {
        setShuffle(!!shuffle);
        setRepeat(repeat);
      }
    );
    socket.on("error_msg", ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });
    socket.on("taken_pokemon_updated", (ids: number[]) => {
      setTakenIds(Array.isArray(ids) ? ids : []);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  // Peek when not joined
  useEffect(() => {
    if (joined) return;
    const sock = socketRef.current;
    if (!sock) return;
    const doPeek = () => {
      sock.emit("peek_room", { roomId }, (resp: { takenPokemonIds?: number[] }) => {
        setTakenIds(resp?.takenPokemonIds || []);
      });
    };
    if (sock.connected) doPeek();
    else sock.once("connect", doPeek);
  }, [joined, roomId]);

  // Send join — and RE-join automatically on every socket reconnect. socket.io auto-reconnects
  // on network blips / tab backgrounding / server restarts; without rejoining, the server's
  // socketIndex no longer has us, so every subsequent emit silently fails and we look like a
  // ghost in our own room. Initial-join cruft (room name/place from URL) only runs once.
  const initialJoinDoneRef = useRef(false);
  useEffect(() => {
    if (!joined || !name || !pokemonId) return;
    const sock = socketRef.current;
    if (!sock) return;
    const doJoin = () => {
      sock.emit(
        "join",
        { roomId, name, pokemonId },
        (resp: { ok?: boolean; error?: string; takenPokemonIds?: number[] }) => {
          if (resp?.error === "pokemon_taken") {
            setTakenIds(resp.takenPokemonIds || []);
            // On a true *initial* join collision, kick back to the picker.
            // On a *reconnect* collision (someone grabbed our slot while we were briefly gone),
            // pick a different free Pokémon and stay in the room rather than booting the user.
            if (!initialJoinDoneRef.current) {
              setJoined(false);
              setPickError("Someone else just picked that Pokémon. Choose another.");
              return;
            }
            const taken = new Set(resp.takenPokemonIds || []);
            const available = POKEMON_LIST.filter((p) => !taken.has(p.id));
            if (available.length > 0) {
              const next = available[Math.floor(Math.random() * available.length)].id;
              setPokemonId(next);
              setStoredPokemonId(next);
            }
            return;
          }
          if (!initialJoinDoneRef.current) {
            initialJoinDoneRef.current = true;
            if (initialRoomName && initialRoomName.trim()) {
              sock.emit("set_room_name", { name: initialRoomName.trim() });
            }
            if (initialPlaceId) {
              sock.emit("set_room_place", { placeId: initialPlaceId });
            }
            if ((initialRoomName || initialPlaceId) && typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.delete("name");
              url.searchParams.delete("place");
              window.history.replaceState(null, "", url.pathname + url.search);
            }
          }
        }
      );
    };
    if (sock.connected) doJoin();
    sock.on("connect", doJoin);
    return () => {
      sock.off("connect", doJoin);
    };
  }, [joined, name, pokemonId, roomId, initialRoomName, initialPlaceId]);

  // ⌘K / Ctrl-K to open search
  useEffect(() => {
    if (!joined) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [joined]);

  // Track unread chat
  useEffect(() => {
    if (rightTab === "chat") setUnreadChat(0);
  }, [rightTab, chat.length]);
  const lastChatLen = useRef(0);
  useEffect(() => {
    if (chat.length > lastChatLen.current && rightTab !== "chat") {
      const newOnes = chat.slice(lastChatLen.current);
      const fromOthers = newOnes.filter((m) => m.userName !== name).length;
      if (fromOthers) setUnreadChat((u) => u + fromOthers);
    }
    lastChatLen.current = chat.length;
  }, [chat, rightTab, name]);

  // Prune selected IDs when queue changes
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(queue.map((t) => t.id));
      const next = new Set<string>();
      prev.forEach((id) => valid.has(id) && next.add(id));
      return next.size === prev.size ? prev : next;
    });
  }, [queue]);

  // ── Handlers ──
  const handleAddVideoId = useCallback((videoId: string) => {
    socketRef.current?.emit("add_track", { url: `https://youtu.be/${videoId}` });
  }, []);
  const handleAddPlaylist = useCallback((playlistId: string) => {
    socketRef.current?.emit("add_playlist", { playlistId });
  }, []);
  const handleSearch = useCallback(
    (query: string, cb: (resp: { results: SearchResult[]; error?: string }) => void) => {
      const sock = socketRef.current;
      if (!sock) return cb({ results: [], error: "not connected" });
      sock.emit("search", { query }, cb);
    },
    []
  );
  const handleFetchAudioUrl = useCallback(
    (videoId: string, refresh: boolean, cb: (resp: { url?: string; error?: string }) => void) => {
      const sock = socketRef.current;
      if (!sock) return cb({ error: "not connected" });
      sock.emit("get_audio_url", { videoId, refresh }, cb);
    },
    []
  );
  const handleFetchLyrics = useCallback(
    (
      videoId: string,
      refresh: boolean,
      cb: (resp: { lyrics: { synced: string | null; plain: string | null; title?: string | null; artist?: string | null } | null }) => void
    ) => {
      const sock = socketRef.current;
      if (!sock) return cb({ lyrics: null });
      sock.emit("get_lyrics", { videoId, refresh }, cb);
    },
    []
  );

  // For LyricsPanel: prefer the local audio's currentTime if rendered, else extrapolate from server playback
  const playbackRef = useRef(playback);
  useEffect(() => { playbackRef.current = playback; }, [playback]);
  const getLyricsCurrentTime = useCallback(() => {
    const local = playerRef.current?.getCurrentTime();
    if (typeof local === "number" && local > 0) return local;
    const p = playbackRef.current;
    return p.playing
      ? p.positionSec + (Date.now() - p.serverUpdatedAt) / 1000
      : p.positionSec;
  }, []);
  const trackStatus = useCallback(
    (videoId: string): TrackStatus => {
      if (current?.videoId === videoId) return "playing";
      if (queue.some((t) => t.videoId === videoId)) return "queued";
      return null;
    },
    [current, queue]
  );

  const handleJoin = useCallback(() => {
    const trimmed = nameInput.trim().slice(0, 32);
    if (!trimmed) return;
    const pid = pickedPokemonId ?? randomPokemonId();
    setStoredName(trimmed);
    setStoredPokemonId(pid);
    setName(trimmed);
    setPokemonId(pid);
    setJoined(true);
  }, [nameInput, pickedPokemonId]);

  const handleTrackEnded = useCallback(() => {
    if (!current) return;
    socketRef.current?.emit("track_ended", { trackId: current.id });
  }, [current]);

  const sendWithPosition = useCallback((event: string, extra: Record<string, unknown> = {}) => {
    const positionSec = playerRef.current?.getCurrentTime() ?? undefined;
    socketRef.current?.emit(event, positionSec !== undefined ? { ...extra, positionSec } : extra);
  }, []);

  const togglePlay = () => {
    if (playback.playing) sendWithPosition("pause");
    else sendWithPosition("play");
  };
  const skip = () => socketRef.current?.emit("skip");
  const seek = (sec: number) =>
    socketRef.current?.emit("seek", { positionSec: sec });
  const removeTrack = (id: string) =>
    socketRef.current?.emit("remove_track", { trackId: id });

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const allSelected = queue.length > 0 && selectedIds.size === queue.length;
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(queue.map((t) => t.id)));
  };
  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    socketRef.current?.emit("remove_tracks", { trackIds: Array.from(selectedIds) });
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const clearAll = () => {
    if (queue.length === 0) return;
    if (!confirmingClear) {
      setConfirmingClear(true);
      setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    socketRef.current?.emit("remove_tracks", { trackIds: queue.map((t) => t.id) });
    setConfirmingClear(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = queue.findIndex((t) => t.id === active.id);
    const newIndex = queue.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newQueue = arrayMove(queue, oldIndex, newIndex);
    setQueue(newQueue);
    socketRef.current?.emit("reorder", { trackIds: newQueue.map((t) => t.id) });
  };

  const submitRename = () => {
    const trimmed = nameDraft.trim().slice(0, 60);
    if (trimmed && trimmed !== roomName) {
      socketRef.current?.emit("set_room_name", { name: trimmed });
    }
    setEditingName(false);
  };

  const setRoomMode = (m: Mode) => socketRef.current?.emit("set_mode", { mode: m });
  const claimHost = () => socketRef.current?.emit("claim_host");

  // ── Join screen ──
  if (!joined) {
    return (
      <div className="page">
        <div className="onb">
          <div className="onb-card">
            <div className="onb-eyebrow">
              <span className="live-dot" />
              {initialRoomName ? "You've been invited" : "Joining a room"}
            </div>
            <h1>{initialRoomName ? `Join "${initialRoomName}"` : "Pick how you'll show up"}</h1>
            <p className="lead">
              Pick a nickname and a Pokémon — that's how everyone in the room will see you.
            </p>

            <div className="onb-section">
              <div className="onb-field-label">Nickname</div>
              <input
                className="onb-input"
                autoFocus
                maxLength={32}
                placeholder="e.g. midnight_dj"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
              />
            </div>

            <div className="onb-section">
              <PokemonPicker
                selectedId={pickedPokemonId}
                onSelect={(id) => {
                  setPickedPokemonId(id);
                  setPickError(null);
                }}
                takenIds={takenIds}
              />
            </div>

            {pickError && (
              <div style={{ color: "var(--yellow)", fontSize: 12, marginBottom: 8 }}>{pickError}</div>
            )}

            {(nameInput.trim() || pickedPokemonId) && (
              <div className="onb-preview">
                <Avatar pokemonId={pickedPokemonId} size={56} />
                <div>
                  <div className="label">You'll appear as</div>
                  <div className="name">{nameInput.trim() || "pick a nickname"}</div>
                  <div className="sub">in room: {initialRoomName || roomId}</div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="onb-cta"
              disabled={
                !nameInput.trim() ||
                !pickedPokemonId ||
                takenIds.includes(pickedPokemonId)
              }
              onClick={handleJoin}
            >
              Enter the radio {HeadphonesSmall}
            </button>
            <div className="onb-footer-note">
              By joining, you agree to keep the vibe immaculate.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Room ──
  const me = users.find((u) => u.id === youUserId);
  const upcomingCount = queue.length;

  // ── Theater mode renders as an OVERLAY on top of the regular .app tree below.
  // The regular tree (and its <AudioPlayer>) stays mounted across toggles, so audio
  // never re-buffers and lyrics stay glued to audio.currentTime.
  const theaterActive = theaterMode && !!current;

  return (
    <>
      {theaterActive && current && (
        <div className="theater">
          <div className="theater-header">
            <span className="theater-label">
              <span className="live-dot" />
              Theater mode · everyone is here
            </span>
            <div className="theater-song-info">
              <div className="theater-song-title">{current.title}</div>
              <div className="theater-song-artist">
                {current.addedByName ? `added by ${current.addedByName}` : ""}
              </div>
            </div>
            <button
              className="theater-exit-btn"
              onClick={() => setTheaterMode(false)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
              </svg>
              Exit theater
            </button>
          </div>

          <div className="theater-lyrics-body">
            <TheaterLyrics
              videoId={current.videoId}
              getCurrentTime={getLyricsCurrentTime}
              fetchLyrics={handleFetchLyrics}
            />
          </div>

          <TheaterControls
            playing={playback.playing}
            getCurrentTime={getLyricsCurrentTime}
            duration={0}
            onTogglePlay={togglePlay}
            onSkip={skip}
          />
        </div>
      )}

    <div className="app" style={theaterActive ? { display: "none" } : undefined}>
      {/* LEFT: users sidebar */}
      <aside className={`sidebar ${mobilePanel === "users" ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <h2>
            <a href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", color: "inherit" }}>
              <VeentLogo size={22} />
            </a>
            <span className="live-dot" />
            Veent Radio
          </h2>
          <button
            className="mobile-panel-close"
            onClick={() => setMobilePanel("main")}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="section-label">
          <span>Listening</span>
          <span className="count">{users.length}</span>
        </div>
        <ul className="user-list scroll">
          {users.map((u) => {
            const isHost = u.id === hostUserId && mode === "host";
            return (
              <li key={u.id} className={`user-row ${u.id === youUserId ? "me" : ""}`}>
                <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                  <Avatar pokemonId={u.pokemonId} size={32} />
                  <span className={`avatar-status ${isHost ? "host" : ""}`} />
                </div>
                <div className="user-meta">
                  <div className="name">
                    {u.name}
                    {isHost && <span className="badge" title="Host">{CrownIcon}</span>}
                  </div>
                  <div className="role">
                    {HeadphonesSmall}
                    <span style={{ marginLeft: 4 }}>
                      {u.id === youUserId ? "you" : isHost ? "host · jamming" : "listening"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="you-bar">
          <Avatar pokemonId={me?.pokemonId ?? null} size={28} />
          <div className="user-meta">
            <div className="name">{me?.name || name}</div>
            <div className="role">Online</div>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="Settings"
            aria-label="Settings"
            disabled
            style={{ opacity: 0.4, cursor: "default" }}
          >
            {SettingsIcon}
          </button>
        </div>
      </aside>

      {/* CENTER: main */}
      <main className="main">
        <div className="topbar">
          {editingName ? (
            <input
              className="channel-input"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={60}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setEditingName(false);
              }}
            />
          ) : (
            <button
              className="channel"
              onClick={() => {
                setNameDraft(roomName);
                setEditingName(true);
              }}
              title="Click to rename"
            >
              <span className="channel-hash">{HashIcon}</span>
              <span className="channel-name">{roomName || roomId}</span>
            </button>
          )}
          <div className="divider" />
          <div className="topic">
            {mode === "host"
              ? hostUserId === youUserId
                ? "You're hosting — audio plays on your device."
                : `Host: ${users.find((u) => u.id === hostUserId)?.name || "—"} (audio plays on their device)`
              : "Same song, same time — synced for everyone."}
          </div>
          <div className="spacer" />
          <div className="mode-toggle" role="group" aria-label="Playback mode">
            <button
              type="button"
              className={mode === "synced" ? "active" : ""}
              onClick={() => mode !== "synced" && setRoomMode("synced")}
              title="Synced — every device plays the song in sync"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z" />
              </svg>
              Synced
            </button>
            <button
              type="button"
              className={mode === "host" ? "active" : ""}
              onClick={() => mode !== "host" && setRoomMode("host")}
              title="Host — only the host's device plays audio (e.g. for a Bluetooth speaker in the room)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              Host
            </button>
          </div>
          <button className="search-trigger" onClick={() => setSearchOpen(true)}>
            {SearchIcon}
            <span>Search a song or paste a link</span>
            <kbd>⌘K</kbd>
          </button>
          <ShareButton
            inviteUrl={typeof window !== "undefined" ? window.location.origin + `/r/${roomId}` : `/r/${roomId}`}
            listenerCount={users.length}
          />
        </div>

        <div className="main-body">
          {mode === "host" && hostUserId !== youUserId && (
            <div
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "10px 14px",
                fontSize: 13,
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexShrink: 0,
              }}
            >
              <span style={{ flex: 1 }}>
                Audio's playing on{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {users.find((u) => u.id === hostUserId)?.name || "—"}
                </strong>
                's device. Want the speaker?
              </span>
              <button
                type="button"
                onClick={claimHost}
                style={{
                  background: "var(--brand)",
                  color: "white",
                  border: 0,
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Make me host
              </button>
            </div>
          )}

          {(mode === "synced" || hostUserId === youUserId) && (
            <AudioPlayer
              ref={playerRef}
              track={
                current
                  ? {
                      videoId: current.videoId,
                      title: current.title,
                      thumbnail: current.thumbnail,
                      addedByName: current.addedByName,
                      addedByPokemonId: current.addedByPokemonId,
                    }
                  : null
              }
              playing={playback.playing}
              positionSec={playback.positionSec}
              serverUpdatedAt={playback.serverUpdatedAt}
              shuffle={shuffle}
              repeat={repeat}
              hasNext={queue.length > 0 || repeat !== "off"}
              onTogglePlay={togglePlay}
              onSkip={skip}
              onSeek={seek}
              onToggleShuffle={() =>
                socketRef.current?.emit("set_shuffle", { shuffle: !shuffle })
              }
              onCycleRepeat={() => {
                const next: RepeatMode = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
                socketRef.current?.emit("set_repeat", { repeat: next });
              }}
              lyricsActive={lyricsOpen}
              onToggleLyrics={() => setLyricsOpen((v) => !v)}
              onTheaterMode={() => setTheaterMode(true)}
              onEnded={handleTrackEnded}
              fetchAudioUrl={handleFetchAudioUrl}
            />
          )}

          {mode === "host" && hostUserId !== youUserId && current && (
            <div
              className="now-playing"
              style={{
                ["--np-grad-1" as string]: "#5865f2",
                ["--np-grad-2" as string]: "#1e1f22",
              } as React.CSSProperties}
            >
              <div className="np-cover">
                <img src={current.thumbnail} alt="" />
              </div>
              <div className="np-info">
                <div className="np-eyebrow">{HeadphonesSmall} Now playing</div>
                <div className="np-title">{current.title}</div>
                <div className="np-added-by">
                  <Avatar pokemonId={current.addedByPokemonId} size={18} />
                  added by <strong style={{ fontWeight: 600 }}>{current.addedByName}</strong>
                </div>
                <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                  Audio is playing on the host's device.
                </div>
              </div>
            </div>
          )}

          {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}

          {lyricsOpen && current ? (
            <div className="inline-lyrics">
              <div className="inline-lyrics-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                <span className="inline-lyrics-title">Lyrics</span>
                <span className="inline-lyrics-badge">Synced</span>
                <div style={{ flex: 1 }} />
                <button
                  className="inline-lyrics-icon-btn"
                  onClick={() => setTheaterMode(true)}
                  title="Theater mode"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
                <button
                  className="inline-lyrics-icon-btn"
                  onClick={() => setLyricsOpen(false)}
                  title="Close lyrics"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <LyricsPanel
                videoId={current.videoId}
                getCurrentTime={getLyricsCurrentTime}
                fetchLyrics={handleFetchLyrics}
              />
            </div>
          ) : (

          <div className="queue">
            <div className="queue-header">
              <div className="queue-title">
                {HashIcon} Up next
                <span className="count">{upcomingCount}</span>
              </div>
              <div className="spacer" />
              {selectMode ? (
                <>
                  <button className="header-btn" onClick={toggleSelectAll}>
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                  <button
                    className="header-btn danger"
                    onClick={deleteSelected}
                    disabled={selectedIds.size === 0}
                    style={selectedIds.size === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  >
                    Delete {selectedIds.size}
                  </button>
                  <button className="header-btn" onClick={exitSelectMode}>Cancel</button>
                </>
              ) : (
                <>
                  {queue.length > 0 && (
                    <>
                      <button className="header-btn" onClick={() => setSelectMode(true)}>
                        Select
                      </button>
                      <button
                        className={"header-btn " + (confirmingClear ? "danger" : "")}
                        onClick={clearAll}
                      >
                        {confirmingClear ? "Click again to confirm" : "Clear"}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <ul className="queue-list scroll">
                  {queue.length === 0 && (
                    <li className="queue-empty">
                      Queue is empty. Open search (⌘K) and add the first track.
                    </li>
                  )}
                  {queue.map((t, i) => (
                    <SortableQueueItem
                      key={t.id}
                      track={t}
                      index={i}
                      isUpNext={!shuffle && i === 0}
                      selectMode={selectMode}
                      isSelected={selectedIds.has(t.id)}
                      onToggleSelect={toggleSelected}
                      onRemove={removeTrack}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>

          )}
        </div>
      </main>

      {/* RIGHT: tabs */}
      <aside className={`right ${mobilePanel === "chat" || mobilePanel === "history" ? "right--open" : ""}`}>
        <button
          className="mobile-panel-close"
          onClick={() => setMobilePanel("main")}
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div className="right-tabs">
          <button
            className={`right-tab ${rightTab === "chat" ? "active" : ""}`}
            onClick={() => setRightTab("chat")}
          >
            {ChatTabIcon} Chat
            {unreadChat > 0 && rightTab !== "chat" && (
              <span className="badge">{unreadChat}</span>
            )}
          </button>
          <button
            className={`right-tab ${rightTab === "history" ? "active" : ""}`}
            onClick={() => setRightTab("history")}
          >
            {HistoryTabIcon} History
          </button>
        </div>
        {rightTab === "chat" ? (
          <ChatPanel
            messages={chat}
            roomId={roomId}
            onSend={(text, imageUrl) =>
              socketRef.current?.emit("send_chat", { text, imageUrl })
            }
          />
        ) : (
          <HistoryPanel events={activity} />
        )}
      </aside>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onAdd={handleAddVideoId}
        onAddPlaylist={handleAddPlaylist}
        search={handleSearch}
        getStatus={trackStatus}
      />

      {/* Mobile tab bar */}
      <div className="mobile-tab-bar">
        <button
          className={mobilePanel === "main" ? "active" : ""}
          onClick={() => setMobilePanel("main")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          Playing
        </button>
        <button
          className={mobilePanel === "users" ? "active" : ""}
          onClick={() => setMobilePanel("users")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {users.length}
        </button>
        <button
          className={mobilePanel === "chat" ? "active" : ""}
          onClick={() => { setMobilePanel("chat"); setRightTab("chat"); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Chat
          {unreadChat > 0 && mobilePanel !== "chat" && (
            <span className="tab-badge">{unreadChat}</span>
          )}
        </button>
        <button
          className={mobilePanel === "history" ? "active" : ""}
          onClick={() => { setMobilePanel("history"); setRightTab("history"); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 3" />
          </svg>
          History
        </button>
      </div>
    </div>
    </>
  );
}
