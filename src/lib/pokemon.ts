// Curated list of recognizable, well-distributed Pokémon (Gens 1–3+)
// Using PokeAPI's official sprite CDN

export interface PokemonEntry {
  id: number;
  name: string;
  color: string;
}

export const POKEMON: PokemonEntry[] = [
  { id: 1,   name: "Bulbasaur",  color: "#7AC74C" },
  { id: 4,   name: "Charmander", color: "#EE8130" },
  { id: 7,   name: "Squirtle",   color: "#6390F0" },
  { id: 25,  name: "Pikachu",    color: "#F7D02C" },
  { id: 39,  name: "Jigglypuff", color: "#F4B7C7" },
  { id: 52,  name: "Meowth",     color: "#E0C068" },
  { id: 54,  name: "Psyduck",    color: "#F2D24E" },
  { id: 63,  name: "Abra",       color: "#F4B96B" },
  { id: 66,  name: "Machop",     color: "#A86464" },
  { id: 92,  name: "Gastly",     color: "#735797" },
  { id: 94,  name: "Gengar",     color: "#5E4773" },
  { id: 104, name: "Cubone",     color: "#B8A878" },
  { id: 113, name: "Chansey",    color: "#FAB1C4" },
  { id: 122, name: "Mr. Mime",   color: "#E16AA0" },
  { id: 131, name: "Lapras",     color: "#5C9CC9" },
  { id: 133, name: "Eevee",      color: "#C8A06A" },
  { id: 143, name: "Snorlax",    color: "#5A7AAA" },
  { id: 150, name: "Mewtwo",     color: "#A57BBE" },
  { id: 151, name: "Mew",        color: "#F4A8C9" },
  { id: 155, name: "Cyndaquil",  color: "#F08030" },
  { id: 158, name: "Totodile",   color: "#3DB7E0" },
  { id: 172, name: "Pichu",      color: "#FFD53D" },
  { id: 175, name: "Togepi",     color: "#F7E1A0" },
  { id: 196, name: "Espeon",     color: "#D88FB7" },
  { id: 197, name: "Umbreon",    color: "#5A4A6A" },
  { id: 249, name: "Lugia",      color: "#A6BBE8" },
  { id: 250, name: "Ho-Oh",      color: "#E66B4B" },
  { id: 257, name: "Blaziken",   color: "#D14538" },
  { id: 282, name: "Gardevoir",  color: "#7DC9C4" },
  { id: 359, name: "Absol",      color: "#9CADBC" },
  { id: 384, name: "Rayquaza",   color: "#3F8C5A" },
  { id: 448, name: "Lucario",    color: "#3F6E9F" },
];

export const POKEMON_BY_ID = new Map(POKEMON.map((p) => [p.id, p]));

export function findPoke(id: number): PokemonEntry {
  return POKEMON_BY_ID.get(id) || POKEMON[0];
}

export function pokeMiniUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}
