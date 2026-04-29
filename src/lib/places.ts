export type TimeOfDay =
  | "morning"
  | "day"
  | "sunset"
  | "dusk"
  | "night"
  | "twilight"
  | "cosmic"
  | "snowy"
  | "storm"
  | "overcast"
  | "dappled";

export interface Place {
  id: string;
  name: string;
  region: string;
  palette: [string, string, string];
  accent: string;
  timeOfDay: TimeOfDay;
}

export const POKE_PLACES: Place[] = [
  { id: "pallet-town",      name: "Pallet Town",       region: "Kanto",  palette: ["#9be7a3", "#5fb87a", "#2d6b4a"], accent: "#f4d35e", timeOfDay: "morning" },
  { id: "viridian-forest",  name: "Viridian Forest",   region: "Kanto",  palette: ["#3a6b3a", "#1f4524", "#0e2a18"], accent: "#a3e635", timeOfDay: "dappled" },
  { id: "cerulean-cape",    name: "Cerulean Cape",     region: "Kanto",  palette: ["#a8d8ea", "#5aa5d4", "#2a5d8f"], accent: "#fef3c7", timeOfDay: "day" },
  { id: "lavender-tower",   name: "Lavender Town",     region: "Kanto",  palette: ["#3d2a52", "#241830", "#0e0a18"], accent: "#c4a3e8", timeOfDay: "night" },
  { id: "cinnabar-volcano", name: "Cinnabar Island",   region: "Kanto",  palette: ["#7a1d1d", "#3d0a0a", "#1a0303"], accent: "#ff8c42", timeOfDay: "dusk" },
  { id: "mt-moon",          name: "Mt. Moon",          region: "Kanto",  palette: ["#1a1d3a", "#0a0e24", "#04060f"], accent: "#e0e7ff", timeOfDay: "night" },
  { id: "goldenrod-skyline",name: "Goldenrod City",    region: "Johto",  palette: ["#f4a261", "#e76f51", "#7a3624"], accent: "#ffd166", timeOfDay: "sunset" },
  { id: "ecruteak",         name: "Ecruteak City",     region: "Johto",  palette: ["#2a3858", "#1a2440", "#0a1226"], accent: "#fbbf24", timeOfDay: "night" },
  { id: "ilex-forest",      name: "Ilex Forest",       region: "Johto",  palette: ["#4a3a2a", "#2a1f15", "#0f0a05"], accent: "#86efac", timeOfDay: "twilight" },
  { id: "sootopolis",       name: "Sootopolis City",   region: "Hoenn",  palette: ["#3aa5d4", "#1a6db0", "#062f5a"], accent: "#fef3c7", timeOfDay: "day" },
  { id: "route-113",        name: "Route 113 (Ash)",   region: "Hoenn",  palette: ["#6b5d52", "#3d342c", "#1a1612"], accent: "#cbd5e1", timeOfDay: "overcast" },
  { id: "mt-pyre",          name: "Mt. Pyre",          region: "Hoenn",  palette: ["#2a1f3d", "#15102a", "#080515"], accent: "#a78bfa", timeOfDay: "night" },
  { id: "snowpoint",        name: "Snowpoint City",    region: "Sinnoh", palette: ["#cfe7f5", "#7aaed4", "#3a6589"], accent: "#f0f9ff", timeOfDay: "snowy" },
  { id: "eterna-forest",    name: "Eterna Forest",     region: "Sinnoh", palette: ["#1f3d2a", "#0e2415", "#040d08"], accent: "#fde68a", timeOfDay: "dappled" },
  { id: "spear-pillar",     name: "Spear Pillar",      region: "Sinnoh", palette: ["#1a1530", "#0a0820", "#030210"], accent: "#c084fc", timeOfDay: "cosmic" },
  { id: "castelia",         name: "Castelia City",     region: "Unova",  palette: ["#2a3b5e", "#13213d", "#040a1a"], accent: "#fcd34d", timeOfDay: "night" },
  { id: "dragonspiral",     name: "Dragonspiral Tower",region: "Unova",  palette: ["#5a4a8a", "#2f2454", "#100a26"], accent: "#fb7185", timeOfDay: "storm" },
  { id: "lumiose",          name: "Lumiose City",      region: "Kalos",  palette: ["#d4a574", "#a06a3d", "#4a2e15"], accent: "#fbbf24", timeOfDay: "sunset" },
  { id: "akala-beach",      name: "Akala Beach",       region: "Alola",  palette: ["#fda4af", "#fb7185", "#9f1239"], accent: "#fef3c7", timeOfDay: "sunset" },
  { id: "lake-of-the-moone",name: "Lake of the Moone", region: "Alola",  palette: ["#1e1b4b", "#0c0a2e", "#030312"], accent: "#e0e7ff", timeOfDay: "cosmic" },
  { id: "galar-route-2",    name: "Galar Countryside", region: "Galar",  palette: ["#86b386", "#4a7a4a", "#1f3a1f"], accent: "#fef9c3", timeOfDay: "morning" },
  { id: "crown-tundra",     name: "Crown Tundra",      region: "Galar",  palette: ["#dbeafe", "#7dd3fc", "#1e3a5f"], accent: "#fef3c7", timeOfDay: "snowy" },
];

export const POKE_PLACES_BY_ID: Record<string, Place> = Object.fromEntries(
  POKE_PLACES.map((p) => [p.id, p])
);

export function randomPlaceId(excludeId?: string | null): string {
  const pool = excludeId ? POKE_PLACES.filter((p) => p.id !== excludeId) : POKE_PLACES;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function isValidPlaceId(id: unknown): id is string {
  return typeof id === "string" && !!POKE_PLACES_BY_ID[id];
}
