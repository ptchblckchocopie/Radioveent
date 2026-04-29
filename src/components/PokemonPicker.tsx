"use client";
import { useMemo, useState } from "react";
import pokemonList from "@/lib/pokemon.json";
import { spriteUrl } from "./Avatar";

type Pokemon = { id: number; name: string };
const ALL = pokemonList as Pokemon[];

type Props = {
  selectedId: number | null;
  onSelect: (id: number) => void;
  takenIds: number[];
};

export default function PokemonPicker({ selectedId, onSelect, takenIds }: Props) {
  const [query, setQuery] = useState("");
  const takenSet = useMemo(() => new Set(takenIds), [takenIds]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ALL.slice(0, 64);
    return ALL.filter((p) => p.name.includes(q)).slice(0, 64);
  }, [query]);

  const pickRandom = () => {
    const available = ALL.filter((p) => !takenSet.has(p.id));
    if (available.length === 0) return;
    const p = available[Math.floor(Math.random() * available.length)];
    onSelect(p.id);
  };

  return (
    <div>
      <div className="onb-field-label">
        <span>Choose your Pokémon</span>
        <button type="button" className="onb-randomize" onClick={pickRandom}>
          🎲 Randomize
        </button>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search Pokémon"
        className="onb-input"
        style={{ marginBottom: 8 }}
      />
      <div className="poke-grid scroll">
        {filtered.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: 12 }}>
            No matches.
          </div>
        ) : (
          filtered.map((p) => {
            const isTaken = takenSet.has(p.id);
            const isSelected = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => !isTaken && onSelect(p.id)}
                disabled={isTaken}
                title={isTaken ? `${p.name} (taken)` : p.name}
                className={`poke-tile ${isSelected ? "selected" : ""} ${isTaken ? "taken" : ""}`}
              >
                <img
                  loading="lazy"
                  src={spriteUrl(p.id)}
                  alt={p.name}
                />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
