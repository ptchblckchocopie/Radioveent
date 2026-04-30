"use client";
import { useMemo } from "react";
import { POKEMON, pokeMiniUrl } from "@/lib/pokemon";

type Props = {
  selectedId: number | null;
  onSelect: (id: number) => void;
  takenIds: number[];
};

export default function PokemonPicker({ selectedId, onSelect, takenIds }: Props) {
  const takenSet = useMemo(() => new Set(takenIds), [takenIds]);

  const available = useMemo(
    () => POKEMON.filter((p) => !takenSet.has(p.id)),
    [takenSet],
  );

  const pickRandom = () => {
    if (available.length === 0) return;
    const p = available[Math.floor(Math.random() * available.length)];
    onSelect(p.id);
  };

  return (
    <div className="onb-section">
      <div className="onb-field-label" style={{ display: "flex", alignItems: "center" }}>
        <span>Choose your Pokémon</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="onb-randomize" onClick={pickRandom}>
          🎲 Randomize
        </button>
      </div>
      <div className="poke-grid scroll">
        {POKEMON.map((p) => {
          const taken = takenSet.has(p.id);
          const sel = selectedId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`poke-tile ${sel ? "selected" : ""} ${taken ? "taken" : ""}`}
              onClick={() => !taken && onSelect(p.id)}
              disabled={taken}
              title={taken ? `${p.name} (taken)` : p.name}
            >
              <span className="num">#{String(p.id).padStart(3, "0")}</span>
              <img
                src={pokeMiniUrl(p.id)}
                alt={p.name}
                loading="lazy"
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
