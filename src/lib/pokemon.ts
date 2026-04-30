// Curated list of recognizable, well-distributed Pokémon (Gens 1–3+)
// Using PokeAPI's official sprite CDN

export interface PokemonEntry {
  id: number;
  name: string;
  color: string;
}

export const POKEMON: PokemonEntry[] = [
  // Gen 1 — Kanto
  { id: 1,   name: "Bulbasaur",  color: "#7AC74C" },
  { id: 4,   name: "Charmander", color: "#EE8130" },
  { id: 6,   name: "Charizard",  color: "#F08030" },
  { id: 7,   name: "Squirtle",   color: "#6390F0" },
  { id: 9,   name: "Blastoise",  color: "#6390F0" },
  { id: 25,  name: "Pikachu",    color: "#F7D02C" },
  { id: 35,  name: "Clefairy",   color: "#EE99AC" },
  { id: 37,  name: "Vulpix",     color: "#C8764E" },
  { id: 39,  name: "Jigglypuff", color: "#F4B7C7" },
  { id: 52,  name: "Meowth",     color: "#E0C068" },
  { id: 54,  name: "Psyduck",    color: "#F2D24E" },
  { id: 58,  name: "Growlithe",  color: "#E88040" },
  { id: 63,  name: "Abra",       color: "#F4B96B" },
  { id: 66,  name: "Machop",     color: "#A86464" },
  { id: 74,  name: "Geodude",    color: "#B8A038" },
  { id: 92,  name: "Gastly",     color: "#735797" },
  { id: 94,  name: "Gengar",     color: "#5E4773" },
  { id: 104, name: "Cubone",     color: "#B8A878" },
  { id: 113, name: "Chansey",    color: "#FAB1C4" },
  { id: 122, name: "Mr. Mime",   color: "#E16AA0" },
  { id: 129, name: "Magikarp",   color: "#E8706A" },
  { id: 130, name: "Gyarados",   color: "#6890F0" },
  { id: 131, name: "Lapras",     color: "#5C9CC9" },
  { id: 132, name: "Ditto",      color: "#A890F0" },
  { id: 133, name: "Eevee",      color: "#C8A06A" },
  { id: 143, name: "Snorlax",    color: "#5A7AAA" },
  { id: 147, name: "Dratini",    color: "#7B8FD0" },
  { id: 149, name: "Dragonite",  color: "#E8A048" },
  { id: 150, name: "Mewtwo",     color: "#A57BBE" },
  { id: 151, name: "Mew",        color: "#F4A8C9" },
  // Gen 2 — Johto
  { id: 152, name: "Chikorita",  color: "#8BBE52" },
  { id: 155, name: "Cyndaquil",  color: "#F08030" },
  { id: 158, name: "Totodile",   color: "#3DB7E0" },
  { id: 172, name: "Pichu",      color: "#FFD53D" },
  { id: 175, name: "Togepi",     color: "#F7E1A0" },
  { id: 179, name: "Mareep",     color: "#78C8F0" },
  { id: 183, name: "Marill",     color: "#68A0D0" },
  { id: 196, name: "Espeon",     color: "#D88FB7" },
  { id: 197, name: "Umbreon",    color: "#5A4A6A" },
  { id: 245, name: "Suicune",    color: "#5AAAD8" },
  { id: 249, name: "Lugia",      color: "#A6BBE8" },
  { id: 250, name: "Ho-Oh",      color: "#E66B4B" },
  { id: 251, name: "Celebi",     color: "#6CB870" },
  // Gen 3 — Hoenn
  { id: 252, name: "Treecko",    color: "#5CA060" },
  { id: 255, name: "Torchic",    color: "#F09038" },
  { id: 258, name: "Mudkip",     color: "#5898D0" },
  { id: 257, name: "Blaziken",   color: "#D14538" },
  { id: 282, name: "Gardevoir",  color: "#7DC9C4" },
  { id: 302, name: "Sableye",    color: "#705898" },
  { id: 334, name: "Altaria",    color: "#75CCD8" },
  { id: 359, name: "Absol",      color: "#9CADBC" },
  { id: 384, name: "Rayquaza",   color: "#3F8C5A" },
  // Gen 4 — Sinnoh
  { id: 387, name: "Turtwig",    color: "#78C850" },
  { id: 390, name: "Chimchar",   color: "#F08030" },
  { id: 393, name: "Piplup",     color: "#5898D0" },
  { id: 403, name: "Shinx",      color: "#5078A0" },
  { id: 448, name: "Lucario",    color: "#3F6E9F" },
  { id: 468, name: "Togekiss",   color: "#E8D0C8" },
  { id: 471, name: "Glaceon",    color: "#8BD0E8" },
  { id: 479, name: "Rotom",      color: "#E87830" },
  // Gen 5 — Unova
  { id: 495, name: "Snivy",      color: "#5FA850" },
  { id: 498, name: "Tepig",      color: "#E87848" },
  { id: 501, name: "Oshawott",   color: "#5898D0" },
  { id: 570, name: "Zorua",      color: "#685068" },
  { id: 571, name: "Zoroark",    color: "#685068" },
  { id: 587, name: "Emolga",     color: "#F0D048" },
  // Gen 6 — Kalos
  { id: 650, name: "Chespin",    color: "#6CA858" },
  { id: 653, name: "Fennekin",   color: "#E8A038" },
  { id: 656, name: "Froakie",    color: "#5890C0" },
  { id: 700, name: "Sylveon",    color: "#F0A0C0" },
  // Gen 7 — Alola
  { id: 722, name: "Rowlet",     color: "#6CB058" },
  { id: 725, name: "Litten",     color: "#C85040" },
  { id: 728, name: "Popplio",    color: "#5898D8" },
  { id: 778, name: "Mimikyu",    color: "#F0D068" },
  // Gen 8 — Galar
  { id: 810, name: "Grookey",    color: "#68B050" },
  { id: 813, name: "Scorbunny",  color: "#E87050" },
  { id: 816, name: "Sobble",     color: "#5898D0" },
  { id: 835, name: "Yamper",     color: "#E8C848" },
  // Gen 9 — Paldea
  { id: 906, name: "Sprigatito", color: "#68B858" },
  { id: 909, name: "Fuecoco",    color: "#E86848" },
  { id: 912, name: "Quaxly",     color: "#5898E0" },
];

export const POKEMON_BY_ID = new Map(POKEMON.map((p) => [p.id, p]));

export function findPoke(id: number): PokemonEntry {
  return POKEMON_BY_ID.get(id) || POKEMON[0];
}

export function pokeMiniUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}
