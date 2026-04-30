"use client";

import { findPoke, pokeMiniUrl } from "@/lib/pokemon";

type Props = {
  pokemonId: number | null | undefined;
  size?: number;
  className?: string;
  ring?: string;
};

export function spriteUrl(id: number) {
  return pokeMiniUrl(id);
}

export default function Avatar({ pokemonId, size = 28, className = "", ring }: Props) {
  const dim = { width: size, height: size };
  if (!pokemonId) {
    return (
      <div
        className={className}
        style={{
          ...dim,
          background: "var(--bg-elevated)",
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: Math.max(9, size * 0.4),
        }}
        aria-hidden="true"
      />
    );
  }
  const p = findPoke(pokemonId);
  return (
    <div
      className={className}
      style={{
        ...dim,
        borderRadius: "50%",
        background: p.color,
        backgroundImage: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 60%), linear-gradient(135deg, ${p.color}, ${p.color}dd)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        boxShadow: ring ? `0 0 0 2px ${ring}` : "none",
        position: "relative",
      }}
    >
      <img
        src={pokeMiniUrl(pokemonId)}
        alt={p.name}
        loading="lazy"
        draggable={false}
        style={{
          width: "110%",
          height: "110%",
          objectFit: "contain",
          imageRendering: "pixelated",
          filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
          marginTop: "4%",
        }}
      />
    </div>
  );
}
