"use client";
import { useState } from "react";
import { POKEMON } from "@/lib/pokemon";
import { findPoke } from "@/lib/pokemon";
import Avatar from "./Avatar";
import PokemonPicker from "./PokemonPicker";

type Props = {
  inviteRoom?: string | null;
  takenIds?: number[];
  onSubmit: (data: { name: string; pokeId: number }) => void;
};

export default function NicknamePage({ inviteRoom, takenIds = [], onSubmit }: Props) {
  const [name, setName] = useState("");
  const [pokeId, setPokeId] = useState<number | null>(null);

  const available = POKEMON.filter((p) => !takenIds.includes(p.id));
  const selected = pokeId ? findPoke(pokeId) : null;
  const canSubmit = name.trim().length >= 2;

  return (
    <div className="page">
      <div className="onb">
        <div className="onb-card">
          <div className="onb-eyebrow">
            <span className="live-dot" />
            {inviteRoom ? "You've been invited" : "Welcome to Late Night Radio"}
          </div>
          <h1>{inviteRoom ? `Join "${inviteRoom}"` : "Pick a nickname"}</h1>
          <p className="lead">
            {inviteRoom
              ? "Pick a nickname and a Pokémon — that's how everyone in the room will see you."
              : "Pick a nickname and a Pokémon. You'll keep this identity across rooms."}
          </p>

          {inviteRoom && (
            <div className="onb-invite-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07L11.7 5.3" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <div className="label">
                <strong>Invite link</strong>
                Joining radio · <code style={{ color: "var(--text-primary)" }}>{inviteRoom}</code>
              </div>
            </div>
          )}

          <div className="onb-section">
            <div className="onb-field-label">Nickname</div>
            <input
              className="onb-input"
              autoFocus
              maxLength={20}
              placeholder="e.g. midnight_dj"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  const finalPoke = pokeId || available[Math.floor(Math.random() * available.length)]?.id || 25;
                  onSubmit({ name: name.trim(), pokeId: finalPoke });
                }
              }}
            />
          </div>

          <PokemonPicker
            selectedId={pokeId}
            onSelect={setPokeId}
            takenIds={takenIds}
          />

          {(name.trim() || selected) && (
            <div className="onb-preview">
              {selected ? (
                <Avatar pokemonId={selected.id} size={56} />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "var(--bg-elevated)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    fontSize: 24,
                  }}
                >
                  ?
                </div>
              )}
              <div>
                <div className="label">You'll appear as</div>
                <div className="name">{name.trim() || "pick a nickname"}</div>
                <div className="sub">
                  {selected ? selected.name : "choose a Pokémon — or hit Randomize"}
                </div>
              </div>
            </div>
          )}

          <button
            className="onb-cta"
            disabled={!canSubmit}
            onClick={() => {
              const finalPoke =
                pokeId || available[Math.floor(Math.random() * available.length)]?.id || 25;
              onSubmit({ name: name.trim(), pokeId: finalPoke });
            }}
          >
            {inviteRoom ? (
              <>
                Enter the radio
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z" />
                </svg>
              </>
            ) : (
              <>
                Continue to dashboard
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M5 5v14l9-7zM16 5h3v14h-3z" />
                </svg>
              </>
            )}
          </button>
          <div className="onb-footer-note">
            By joining, you agree to keep the vibe immaculate.
          </div>
        </div>
      </div>
    </div>
  );
}
