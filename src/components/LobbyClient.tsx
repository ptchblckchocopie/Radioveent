"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { io as ioClient, type Socket } from "socket.io-client";
import { nanoid } from "nanoid";
import type { RoomSummary } from "@/lib/types";
import { POKE_PLACES, POKE_PLACES_BY_ID, randomPlaceId } from "@/lib/places";
import Avatar from "./Avatar";
import PokePlace from "./PokePlace";

function getStoredName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("mq:name") || "";
}
function getStoredPokemonId(): number | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem("mq:pokemonId");
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 1025 ? n : null;
}

export default function LobbyClient() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [storedName, setStoredNameState] = useState<string>("");
  const [storedPid, setStoredPid] = useState<number | null>(null);

  useEffect(() => {
    setStoredNameState(getStoredName());
    setStoredPid(getStoredPokemonId());
  }, []);

  useEffect(() => {
    const socket: Socket = ioClient({ path: "/socket.io" });
    socket.emit("subscribe_browse", null, (resp: { rooms?: RoomSummary[] }) => {
      setRooms(resp?.rooms || []);
    });
    socket.on("rooms_updated", (list: RoomSummary[]) => {
      setRooms(Array.isArray(list) ? list : []);
    });
    return () => {
      socket.emit("unsubscribe_browse");
      socket.disconnect();
    };
  }, []);

  return (
    <div className="page">
      <div className="dash">
        <div className="dash-header">
          <span className="brand">
            <span className="live-dot" />
            Veent Radio
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
            tonight's rooms · {rooms.reduce((n, r) => n + r.listenerCount, 0)} listening
          </span>
          {storedName && (
            <div className="me">
              <Avatar pokemonId={storedPid} size={32} />
              <span className="name">{storedName}</span>
            </div>
          )}
        </div>

        <div className="dash-body scroll">
          <div className="dash-section-head">
            <h2>Radio</h2>
            <div className="spacer" />
            <button className="dash-create" onClick={() => setShowCreate(true)}>
              <span className="plus-circle">+</span>
              Create Radio
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="dash-empty">
              <div style={{ fontSize: 48, marginBottom: 8 }}>🎧</div>
              <div>No active rooms — be the first to start one.</div>
            </div>
          ) : (
            <div className="dash-grid">
              {rooms.map((r) => {
                const place = r.placeId ? POKE_PLACES_BY_ID[r.placeId] : null;
                return (
                  <button
                    key={r.id}
                    className="radio-card"
                    onClick={() => router.push(`/r/${r.id}`)}
                  >
                    <div className="cover" style={{ background: "transparent" }}>
                      {r.placeId ? (
                        <PokePlace placeId={r.placeId} size="card" />
                      ) : r.currentTrack ? (
                        <img src={r.currentTrack.thumbnail} alt="" />
                      ) : (
                        <span className="placeholder">🎵</span>
                      )}
                      <div className="cover-overlay">
                        {r.currentTrack ? (
                          <span className="live-pill">
                            <span className="dot" />
                            LIVE
                          </span>
                        ) : (
                          <span className="quiet-pill">QUIET</span>
                        )}
                      </div>
                    </div>
                    <div className="info">
                      <h3>{r.name}</h3>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          fontWeight: 600,
                        }}
                      >
                        {place ? `${place.name} · ${place.region}` : "no place set"}
                      </div>
                      <div className="now-line">
                        {r.currentTrack ? `♫ ${r.currentTrack.title}` : "Nothing playing yet"}
                      </div>
                      <div className="meta">
                        <span className="listeners">
                          {r.avatars.slice(0, 5).map((id) => (
                            <span key={id} className="a">
                              <Avatar pokemonId={id} size={22} />
                            </span>
                          ))}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {r.listenerCount} listening
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateRoomModal
          onCancel={() => setShowCreate(false)}
          onCreate={(name, placeId) => {
            const id = nanoid(6);
            const params = new URLSearchParams();
            const trimmed = name.trim().slice(0, 60);
            if (trimmed) params.set("name", trimmed);
            if (placeId) params.set("place", placeId);
            const qs = params.toString();
            router.push(`/r/${id}${qs ? `?${qs}` : ""}`);
          }}
        />
      )}
    </div>
  );
}

function CreateRoomModal({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string, placeId: string) => void;
}) {
  const [name, setName] = useState("");
  const [placeId, setPlaceId] = useState<string>(() => randomPlaceId());

  const place = POKE_PLACES_BY_ID[placeId];
  const reroll = () => setPlaceId((p) => randomPlaceId(p));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-create" onClick={(e) => e.stopPropagation()}>
        <div className="create-hero">
          <PokePlace placeId={placeId} size="hero" />
          <div className="create-hero-overlay">
            <div className="create-hero-meta">
              <div className="loc-region">{place.region}</div>
              <div className="loc-name">{place.name}</div>
            </div>
            <button className="reroll-btn" onClick={reroll} title="Pick another place">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5.5A5 5 0 1 0 12 8.5" />
                <path d="M12 2v3.5h-3.5" />
              </svg>
              Randomize
            </button>
          </div>
        </div>

        <div className="create-body scroll">
          <h2>Start a new radio</h2>
          <p className="desc">
            Name your room and pick a Pokémon-world setting. The place becomes your room's cover and vibe.
          </p>

          <div className="onb-field-label">Room name</div>
          <input
            className="onb-input"
            autoFocus
            placeholder="e.g. friday-night-vibes"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
          />

          <div className="create-section-head">
            <div className="onb-field-label" style={{ margin: 0 }}>Place</div>
            <div className="create-section-sub">
              {place.name} · {place.region}
            </div>
          </div>
          <div className="place-grid">
            {POKE_PLACES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`place-tile ${p.id === placeId ? "selected" : ""}`}
                onClick={() => setPlaceId(p.id)}
                title={`${p.name} · ${p.region}`}
              >
                <div>
                  <PokePlace placeId={p.id} size="thumb" />
                </div>
                <div className="place-tile-name">{p.name}</div>
              </button>
            ))}
          </div>

          <div className="actions">
            <button className="modal-btn-secondary" onClick={onCancel}>Cancel</button>
            <button
              className="modal-btn-primary"
              disabled={name.trim().length < 2}
              onClick={() => onCreate(name, placeId)}
            >
              Create &amp; enter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
