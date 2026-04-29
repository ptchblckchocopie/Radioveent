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
    if (!q) return ALL.slice(0, 60);
    return ALL.filter((p) => p.name.includes(q)).slice(0, 60);
  }, [query]);

  const pickRandom = () => {
    const available = ALL.filter((p) => !takenSet.has(p.id));
    if (available.length === 0) return;
    const p = available[Math.floor(Math.random() * available.length)];
    onSelect(p.id);
  };

  const selectedName = selectedId
    ? ALL.find((p) => p.id === selectedId)?.name
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Pokémon"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-400"
        />
        <button
          type="button"
          onClick={pickRandom}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-2 rounded-md text-sm whitespace-nowrap"
        >
          Random
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1 max-h-56 overflow-y-auto bg-zinc-950 rounded-md p-1">
        {filtered.length === 0 ? (
          <div className="col-span-6 text-center text-xs text-gray-500 py-6">
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
                className={
                  "aspect-square flex items-center justify-center rounded p-1 transition relative " +
                  (isTaken
                    ? "opacity-30 cursor-not-allowed grayscale"
                    : "hover:bg-zinc-800 ") +
                  (isSelected ? "ring-2 ring-indigo-400 bg-zinc-800" : "")
                }
              >
                <img
                  loading="lazy"
                  src={spriteUrl(p.id)}
                  alt={p.name}
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
                {isTaken && (
                  <span className="absolute inset-0 flex items-center justify-center text-red-400 text-2xl pointer-events-none" aria-hidden="true">
                    ✕
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      {selectedName && (
        <div className="text-xs text-gray-400 text-center">
          Picked: <span className="capitalize text-white">{selectedName}</span>
        </div>
      )}
    </div>
  );
}
