"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io as ioClient, type Socket } from "socket.io-client";
import { nanoid } from "nanoid";
import type { RoomSummary } from "@/lib/types";
import Avatar from "./Avatar";

export default function LobbyClient() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const socket: Socket = ioClient({ path: "/socket.io" });
    socket.emit(
      "subscribe_browse",
      null,
      (resp: { rooms?: RoomSummary[] }) => {
        setRooms(resp?.rooms || []);
      }
    );
    socket.on("rooms_updated", (list: RoomSummary[]) => {
      setRooms(Array.isArray(list) ? list : []);
    });
    return () => {
      socket.emit("unsubscribe_browse");
      socket.disconnect();
    };
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const id = nanoid(6);
    const trimmed = newRoomName.trim().slice(0, 60);
    const url = trimmed
      ? `/r/${id}?name=${encodeURIComponent(trimmed)}`
      : `/r/${id}`;
    router.push(url);
  };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      <header className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">MusicQueue</h1>
        <p className="text-gray-400 mt-2 text-sm md:text-base">
          Browse rooms or start your own. Send the link, vibe together.
        </p>
      </header>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
        <h2 className="text-lg font-semibold mb-3">Create a new room</h2>
        <form onSubmit={handleCreate} className="flex gap-2 flex-wrap">
          <input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Name your room (optional, e.g. Friday Night Vibes)"
            maxLength={60}
            className="flex-1 min-w-[200px] bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-md whitespace-nowrap"
          >
            Create
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          You'll get a shareable link after picking your name and Pokémon.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Active rooms{" "}
          <span className="text-sm text-gray-500 font-normal">
            ({rooms.length})
          </span>
        </h2>
        {rooms.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-gray-500">
            No active rooms — be the first.
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rooms.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                onJoin={() => router.push(`/r/${r.id}`)}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="text-xs text-gray-600 text-center mt-12">
        Rooms vanish 5 min after the last person leaves.
      </footer>
    </main>
  );
}

function RoomCard({ room, onJoin }: { room: RoomSummary; onJoin: () => void }) {
  return (
    <li className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition flex gap-4 items-center">
      {room.currentTrack ? (
        <img
          src={room.currentTrack.thumbnail}
          alt=""
          className="w-20 h-20 object-cover rounded-md flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 bg-zinc-800 rounded-md flex items-center justify-center text-3xl flex-shrink-0">
          🎵
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{room.name}</div>
        {room.currentTrack ? (
          <div className="text-xs text-gray-400 truncate">
            ♫ {room.currentTrack.title}
          </div>
        ) : (
          <div className="text-xs text-gray-500">Nothing playing yet</div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex -space-x-1">
            {room.avatars.slice(0, 5).map((id) => (
              <Avatar
                key={id}
                pokemonId={id}
                size={22}
                className="ring-2 ring-zinc-900 bg-zinc-800 rounded-full"
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">
            {room.listenerCount} listening
          </span>
        </div>
      </div>
      <button
        onClick={onJoin}
        className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-md text-sm font-medium flex-shrink-0"
      >
        Join
      </button>
    </li>
  );
}
