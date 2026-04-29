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
        className={`bg-zinc-700 rounded-full flex-shrink-0 ${className}`}
        style={dim}
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={spriteUrl(pokemonId)}
      alt=""
      className={`flex-shrink-0 object-contain ${className}`}
      style={{ ...dim, imageRendering: "pixelated" }}
      loading="lazy"
    />
  );
}
