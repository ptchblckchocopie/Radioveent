"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ActivityEvent, ChatMessage, Mode, Playback, RoomSnapshot, Track, User } from "@/lib/types";
import AudioPlayer, { type AudioPlayerHandle } from "./AudioPlayer";
import SearchBar, { type SearchResult, type TrackStatus } from "./SearchBar";
import SortableQueueItem from "./SortableQueueItem";
import PokemonPicker from "./PokemonPicker";
import Avatar from "./Avatar";
import ActivityFeed from "./ActivityFeed";
import ChatPanel from "./ChatPanel";
import pokemonList from "@/lib/pokemon.json";
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

function getStoredName(): string {
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

const POKEMON_LIST = pokemonList as { id: number; name: string }[];
function randomPokemonId() {
  return POKEMON_LIST[Math.floor(Math.random() * POKEMON_LIST.length)].id;
}

export default function RoomClient({
  roomId,
  initialRoomName,
}: {
  roomId: string;
  initialRoomName?: string;
}) {
  const [name, setName] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [pokemonId, setPokemonId] = useState<number | null>(null);
  const [pickedPokemonId, setPickedPokemonId] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
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
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [takenIds, setTakenIds] = useState<number[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

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

  // If the picked Pokémon becomes taken (e.g. someone else grabs it before you join), shuffle
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

  // Open socket once on mount; set up all listeners.
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
    });
    socket.on("room_name_updated", ({ name }: { name: string }) => {
      setRoomName(name);
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

  // While on the join screen, peek the room to fetch the taken-Pokémon list
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

  // Once user clicks Join, emit the join with ack and handle pokemon-taken rejection
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
            setJoined(false);
            setPickError("Someone else just picked that Pokémon. Choose another.");
            return;
          }
          // If we navigated here with ?name=... and the room has no name yet, set it.
          if (initialRoomName && initialRoomName.trim()) {
            sock.emit("set_room_name", { name: initialRoomName.trim() });
            // Clean the ?name= out of the URL so the share link is tidy
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.delete("name");
              window.history.replaceState(null, "", url.pathname + url.search);
            }
          }
        }
      );
    };
    if (sock.connected) doJoin();
    else sock.once("connect", doJoin);
  }, [joined, name, pokemonId, roomId, initialRoomName]);

  const submitRename = () => {
    const trimmed = nameDraft.trim().slice(0, 60);
    if (trimmed && trimmed !== roomName) {
      socketRef.current?.emit("set_room_name", { name: trimmed });
    }
    setEditingName(false);
  };

  const isHost = mode === "host" && hostUserId === youUserId;
  const shouldRenderPlayer = mode === "synced" || isHost;

  const sendWithPosition = useCallback((event: string, extra: Record<string, unknown> = {}) => {
    const positionSec = playerRef.current?.getCurrentTime() ?? undefined;
    socketRef.current?.emit(event, positionSec !== undefined ? { ...extra, positionSec } : extra);
  }, []);

  const handleAddVideoId = useCallback((videoId: string) => {
    socketRef.current?.emit("add_track", { url: `https://youtu.be/${videoId}` });
  }, []);

  const handleAddPlaylist = useCallback((playlistId: string) => {
    socketRef.current?.emit("add_playlist", { playlistId });
  }, []);

  const trackStatus = useCallback(
    (videoId: string): TrackStatus => {
      if (current?.videoId === videoId) return "playing";
      if (queue.some((t) => t.videoId === videoId)) return "queued";
      return null;
    },
    [current, queue]
  );

  const handleSearch = useCallback(
    (query: string, cb: (resp: { results: SearchResult[]; error?: string }) => void) => {
      const sock = socketRef.current;
      if (!sock) {
        cb({ results: [], error: "not connected" });
        return;
      }
      sock.emit("search", { query }, cb);
    },
    []
  );

  const handleFetchAudioUrl = useCallback(
    (videoId: string, refresh: boolean, cb: (resp: { url?: string; error?: string }) => void) => {
      const sock = socketRef.current;
      if (!sock) {
        cb({ error: "not connected" });
        return;
      }
      sock.emit("get_audio_url", { videoId, refresh }, cb);
    },
    []
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

  const handleCopyLink = useCallback(() => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  const handleTrackEnded = useCallback(() => {
    if (!current) return;
    socketRef.current?.emit("track_ended", { trackId: current.id });
  }, [current]);

  const togglePlay = () => {
    if (playback.playing) sendWithPosition("pause");
    else sendWithPosition("play");
  };

  const skip = () => socketRef.current?.emit("skip");

  const removeTrack = (trackId: string) => {
    socketRef.current?.emit("remove_track", { trackId });
  };

  // Prune selectedIds when queue changes (e.g., a track was removed by someone else)
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(queue.map((t) => t.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [queue]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  const setRoomMode = (m: Mode) => {
    socketRef.current?.emit("set_mode", { mode: m });
  };

  const claimHost = () => socketRef.current?.emit("claim_host");

  // Name gate
  if (!joined) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin();
          }}
          className="max-w-md w-full space-y-4 bg-zinc-900 p-6 rounded-xl border border-zinc-800"
        >
          <div className="flex items-center gap-3">
            <Avatar pokemonId={pickedPokemonId} size={48} />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">Joining room</h1>
              <p className="text-gray-400 text-sm">
                Room code: <span className="font-mono">{roomId}</span>
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Your name</label>
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={32}
              placeholder="e.g. Rix"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Pick your Pokémon avatar</label>
            <PokemonPicker
              selectedId={pickedPokemonId}
              onSelect={(id) => {
                setPickedPokemonId(id);
                setPickError(null);
              }}
              takenIds={takenIds}
            />
          </div>
          {pickError && <div className="text-xs text-amber-400">{pickError}</div>}
          <button
            type="submit"
            disabled={!nameInput.trim() || !pickedPokemonId || takenIds.includes(pickedPokemonId)}
            className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-2 rounded-md"
          >
            Join
          </button>
        </form>
      </main>
    );
  }

  const hostName = users.find((u) => u.id === hostUserId)?.name;

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitRename();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={60}
                onBlur={submitRename}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-2xl font-bold outline-none focus:border-indigo-400 min-w-0"
              />
            </form>
          ) : (
            <button
              onClick={() => {
                setNameDraft(roomName);
                setEditingName(true);
              }}
              className="text-2xl font-bold tracking-tight text-left hover:text-indigo-300 transition"
              title="Click to rename"
            >
              {roomName || `Room ${roomId}`}
            </button>
          )}
          <p className="text-xs text-gray-500 font-mono">
            <a href="/" className="hover:text-gray-300">← lobby</a>
            {" · "}
            code: {roomId}
            {" "}
            {connected ? "· live" : "· connecting..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex gap-1 text-sm">
            <button
              onClick={() => setRoomMode("synced")}
              className={`px-3 py-1 rounded ${mode === "synced" ? "bg-indigo-500 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Synced
            </button>
            <button
              onClick={() => setRoomMode("host")}
              className={`px-3 py-1 rounded ${mode === "host" ? "bg-indigo-500 text-white" : "text-gray-400 hover:text-white"}`}
            >
              Host
            </button>
          </div>
          <button
            onClick={handleCopyLink}
            className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 px-3 py-2 rounded-lg text-sm"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </header>

      {mode === "host" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-4 text-sm flex items-center justify-between gap-3 flex-wrap">
          <span className="text-gray-300">
            {isHost
              ? "You're the host — audio plays on your device. Plug into your bluetooth speaker."
              : `Host: ${hostName || "—"} — only their device plays audio.`}
          </span>
          {!isHost && (
            <button onClick={claimHost} className="bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded text-white">
              Make me host
            </button>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <section className="md:col-span-2 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Now playing</div>
            {current ? (
              <div className="flex items-center gap-3">
                <img src={current.thumbnail} alt="" className="w-20 h-12 object-cover rounded" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{current.title}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <span>added by</span>
                    <Avatar pokemonId={current.addedByPokemonId} size={18} />
                    <span>{current.addedByName}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">Nothing playing — search or paste a YouTube link below.</div>
            )}
          </div>

          {shouldRenderPlayer && (
            <AudioPlayer
              ref={playerRef}
              videoId={current?.videoId || null}
              playing={playback.playing}
              positionSec={playback.positionSec}
              serverUpdatedAt={playback.serverUpdatedAt}
              onEnded={handleTrackEnded}
              onSeek={(sec) => socketRef.current?.emit("seek", { positionSec: sec })}
              fetchAudioUrl={handleFetchAudioUrl}
            />
          )}

          {current && (
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="bg-indigo-500 hover:bg-indigo-400 px-4 py-2 rounded-lg font-semibold"
              >
                {playback.playing ? "Pause" : "Play"}
              </button>
              <button
                onClick={skip}
                className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg"
                disabled={!current && queue.length === 0}
              >
                Skip
              </button>
            </div>
          )}

          <SearchBar
            onAdd={handleAddVideoId}
            onAddPlaylist={handleAddPlaylist}
            search={handleSearch}
            getStatus={trackStatus}
          />
          {error && <div className="text-sm text-red-400">{error}</div>}

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="px-4 py-2 flex items-center justify-between gap-2 border-b border-zinc-800">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                Queue ({queue.length})
              </div>
              <div className="flex items-center gap-2 text-xs">
                {selectMode ? (
                  <>
                    <button
                      onClick={toggleSelectAll}
                      className="text-gray-400 hover:text-white px-2 py-1"
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                    <button
                      onClick={deleteSelected}
                      disabled={selectedIds.size === 0}
                      className="bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded font-medium"
                    >
                      Delete {selectedIds.size}
                    </button>
                    <button
                      onClick={exitSelectMode}
                      className="text-gray-400 hover:text-white px-2 py-1"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  queue.length > 0 && (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="text-gray-400 hover:text-white px-2 py-1"
                    >
                      Select
                    </button>
                  )
                )}
              </div>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={queue.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul>
                  {queue.length === 0 && (
                    <li className="px-4 py-6 text-sm text-gray-500">Queue is empty.</li>
                  )}
                  {queue.map((t) => (
                    <SortableQueueItem
                      key={t.id}
                      track={t}
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
        </section>

        <aside className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
              Listening ({users.length})
            </div>
            <ul className="space-y-2">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-2 text-sm">
                  <Avatar pokemonId={u.pokemonId} size={28} />
                  <span className="truncate flex-1">{u.name}</span>
                  {u.id === youUserId && <span className="text-xs text-gray-500">(you)</span>}
                  {u.id === hostUserId && mode === "host" && (
                    <span className="text-xs text-indigo-400">host</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">
              Chat
            </div>
            <ChatPanel
              messages={chat}
              roomId={roomId}
              onSend={(text, imageUrl) =>
                socketRef.current?.emit("send_chat", { text, imageUrl })
              }
            />
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">
              Activity
            </div>
            <ActivityFeed events={activity} />
          </div>
        </aside>
      </div>
    </main>
  );
}
