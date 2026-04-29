"use client";
import { POKE_PLACES_BY_ID, type Place } from "@/lib/places";

type Props = {
  placeId: string | null | undefined;
  size?: "thumb" | "card" | "hero";
};

function Ornament({ place }: { place: Place }) {
  const accent = place.accent;
  const [c1] = place.palette;
  const tod = place.timeOfDay;

  if (tod === "night" || tod === "cosmic") {
    return (
      <>
        <circle cx="78" cy="22" r="8" fill={accent} opacity="0.95" />
        <circle cx="76" cy="20" r="6" fill={c1} opacity="0.5" />
        {[[15, 12], [28, 8], [45, 18], [60, 10], [88, 32], [8, 28], [35, 30]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 2 ? 0.6 : 1} fill={accent} opacity={0.6 + (i % 3) * 0.15} />
        ))}
      </>
    );
  }
  if (tod === "sunset" || tod === "dusk") {
    return (
      <>
        <circle cx="50" cy="44" r="11" fill={accent} opacity="0.9" />
        <circle cx="50" cy="44" r="16" fill={accent} opacity="0.18" />
      </>
    );
  }
  if (tod === "morning") {
    return (
      <>
        <circle cx="22" cy="20" r="7" fill={accent} opacity="0.95" />
        <circle cx="22" cy="20" r="12" fill={accent} opacity="0.18" />
        <ellipse cx="65" cy="18" rx="10" ry="3" fill="#fff" opacity="0.7" />
        <ellipse cx="80" cy="14" rx="6" ry="2" fill="#fff" opacity="0.6" />
      </>
    );
  }
  if (tod === "day") {
    return (
      <>
        <circle cx="78" cy="18" r="6" fill={accent} opacity="0.9" />
        <ellipse cx="22" cy="22" rx="11" ry="3" fill="#fff" opacity="0.55" />
        <ellipse cx="48" cy="14" rx="7" ry="2" fill="#fff" opacity="0.5" />
      </>
    );
  }
  if (tod === "snowy") {
    return (
      <>
        <circle cx="80" cy="18" r="5" fill={accent} opacity="0.7" />
        {[[12, 14], [28, 22], [45, 10], [58, 26], [72, 32], [20, 38], [88, 42], [36, 44]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.2} fill="#fff" opacity={0.85} />
        ))}
      </>
    );
  }
  if (tod === "storm") {
    return (
      <>
        <ellipse cx="40" cy="18" rx="22" ry="5" fill="#000" opacity="0.45" />
        <ellipse cx="70" cy="14" rx="14" ry="3" fill="#000" opacity="0.4" />
        <path d="M 48 22 L 44 32 L 49 32 L 45 44" stroke={accent} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  }
  if (tod === "overcast") {
    return (
      <>
        <ellipse cx="30" cy="18" rx="16" ry="4" fill="#fff" opacity="0.35" />
        <ellipse cx="70" cy="22" rx="14" ry="3" fill="#fff" opacity="0.3" />
        {[[20, 38], [40, 42], [60, 46], [80, 40], [15, 52]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.8} fill={accent} opacity={0.5} />
        ))}
      </>
    );
  }
  if (tod === "dappled" || tod === "twilight") {
    return (
      <>
        <path d="M 20 0 L 35 60 L 25 60 L 12 0 Z" fill={accent} opacity="0.12" />
        <path d="M 60 0 L 75 60 L 65 60 L 52 0 Z" fill={accent} opacity="0.1" />
        <circle cx="80" cy="14" r="4" fill={accent} opacity="0.6" />
      </>
    );
  }
  return <circle cx="78" cy="18" r="6" fill={accent} opacity="0.85" />;
}

function Horizon({ place }: { place: Place }) {
  const [, c2, c3] = place.palette;
  const accent = place.accent;
  const tod = place.timeOfDay;

  if (place.region === "Hoenn" && tod !== "night") {
    return (
      <>
        <path d="M 0 50 Q 30 46, 50 50 T 100 50 L 100 60 L 0 60 Z" fill={c3} />
        <ellipse cx="62" cy="50" rx="14" ry="4" fill={c2} opacity="0.85" />
      </>
    );
  }
  if (place.id === "cerulean-cape" || place.id === "sootopolis" || place.id === "akala-beach") {
    return <path d="M 0 50 Q 25 47, 50 50 T 100 50 L 100 60 L 0 60 Z" fill={c3} />;
  }
  if (tod === "snowy") {
    return (
      <>
        <path d="M 0 52 L 22 38 L 38 50 L 56 32 L 72 48 L 100 40 L 100 60 L 0 60 Z" fill={c3} />
        <path d="M 0 56 L 100 56 L 100 60 L 0 60 Z" fill="#fff" opacity="0.85" />
      </>
    );
  }
  if (place.id === "cinnabar-volcano") {
    return (
      <>
        <path d="M 0 60 L 30 48 L 50 28 L 70 48 L 100 60 Z" fill={c3} />
        <path d="M 42 36 L 50 28 L 58 36 L 50 38 Z" fill={accent} opacity="0.8" />
      </>
    );
  }
  if (
    place.id === "mt-moon" ||
    place.id === "mt-pyre" ||
    place.id === "spear-pillar" ||
    place.id === "dragonspiral"
  ) {
    return (
      <path
        d="M 0 60 L 12 42 L 24 50 L 38 32 L 52 46 L 66 28 L 80 44 L 92 36 L 100 48 L 100 60 Z"
        fill={c3}
      />
    );
  }
  if (
    place.id === "lavender-tower" ||
    place.id === "ecruteak" ||
    place.id === "castelia" ||
    place.id === "lumiose"
  ) {
    return (
      <>
        <path
          d="M 0 60 L 0 48 L 8 48 L 8 38 L 18 38 L 18 44 L 26 44 L 26 30 L 36 30 L 36 42 L 46 42 L 46 36 L 56 36 L 56 24 L 66 24 L 66 40 L 76 40 L 76 32 L 86 32 L 86 44 L 100 44 L 100 60 Z"
          fill={c3}
        />
        {[[10, 42], [20, 42], [30, 36], [40, 46], [50, 40], [60, 30], [70, 44], [80, 38]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="1.5" height="1.5" fill={accent} opacity={0.85} />
        ))}
      </>
    );
  }
  return (
    <>
      <path d="M 0 54 Q 20 44, 36 50 T 70 48 T 100 52 L 100 60 L 0 60 Z" fill={c2} opacity="0.85" />
      <path d="M 0 58 Q 30 50, 56 56 T 100 56 L 100 60 L 0 60 Z" fill={c3} />
      {[[15, 52], [28, 50], [44, 48], [62, 50], [78, 52], [90, 54]].map(([x, y], i) => (
        <polygon
          key={i}
          points={`${x},${y - 4} ${x - 2},${y} ${x + 2},${y}`}
          fill={c3}
          opacity="0.95"
        />
      ))}
    </>
  );
}

export default function PokePlace({ placeId, size = "card" }: Props) {
  const place = (placeId && POKE_PLACES_BY_ID[placeId]) || POKE_PLACES_BY_ID["pallet-town"];
  const [c1, c2, c3] = place.palette;
  const sceneId = `scene-${place.id}-${size}`;

  return (
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <defs>
        <linearGradient id={sceneId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="60%" stopColor={c2} />
          <stop offset="100%" stopColor={c3} />
        </linearGradient>
        <radialGradient id={sceneId + "-v"} cx="0.5" cy="0.5" r="0.7">
          <stop offset="60%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="60" fill={`url(#${sceneId})`} />
      <Ornament place={place} />
      <Horizon place={place} />
      <rect x="0" y="0" width="100" height="60" fill={`url(#${sceneId}-v)`} />
    </svg>
  );
}
