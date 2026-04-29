"use client";

type Props = {
  pokemonId: number | null | undefined;
  size?: number;
  className?: string;
};

export function spriteUrl(id: number) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

export default function Avatar({ pokemonId, size = 28, className = "" }: Props) {
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
        }}
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={spriteUrl(pokemonId)}
      alt=""
      className={className}
      style={{
        ...dim,
        flexShrink: 0,
        objectFit: "contain",
        imageRendering: "pixelated",
        display: "inline-block",
      }}
      loading="lazy"
    />
  );
}
