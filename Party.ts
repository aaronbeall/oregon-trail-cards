export type Traveller = { name: string; portrait: number };
const firstNames = [
  "Mabel",
  "Jasper",
  "Nell",
  "Hugo",
  "Cora",
  "Silas",
  "Beatrice",
  "Felix",
  "Hazel",
  "Otis",
  "Pearl",
  "Arthur",
  "Clementine",
  "Theo",
  "Iris",
  "Willa",
  "Edwin",
  "Ada",
  "Roscoe",
  "Florence",
  "Etta",
  "Cecil",
  "Juniper",
  "Milo",
  "Alma",
  "Bram",
  "Olive",
  "Rufus",
  "Esther",
  "Kit",
  "Daisy",
  "Wesley",
  "Winifred",
  "Amos",
  "Poppy",
  "Tobias",
  "Lottie",
  "Emmett",
  "Violet",
  "Finn",
  "Agnes",
  "Percy",
  "Mae",
  "Oscar",
  "Eliza",
  "Levi",
  "Fern",
  "Walter",
  "Clara",
  "August",
  "Opal",
  "Hattie",
  "Basil",
  "Sadie",
  "Reuben",
  "Louisa",
  "Gideon",
  "Blythe",
  "Ansel",
  "Matilda",
  "Elias",
  "Della",
  "Simon",
  "Rose",
];
export type NameCategory = "masculine" | "feminine" | "neutral";
// Categories describe the fictional characters used to generate the portrait atlas.
export const portraitCategories: readonly NameCategory[] = Array.from(
  { length: 18 },
  (_, i) => (i % 2 === 0 ? "feminine" : "masculine"),
);
export const portraitSlots = portraitCategories.map((_, i) => i);
const masculineNames = new Set([
  "Jasper",
  "Hugo",
  "Silas",
  "Felix",
  "Otis",
  "Arthur",
  "Theo",
  "Edwin",
  "Roscoe",
  "Cecil",
  "Milo",
  "Bram",
  "Rufus",
  "Wesley",
  "Amos",
  "Tobias",
  "Emmett",
  "Finn",
  "Percy",
  "Oscar",
  "Levi",
  "Walter",
  "August",
  "Basil",
  "Reuben",
  "Gideon",
  "Ansel",
  "Elias",
  "Simon",
]);
const neutralNames = new Set(["Kit", "Blythe", "Juniper"]);
export const nameCategories: Record<string, NameCategory> = Object.fromEntries(
  firstNames.map((name) => [
    name,
    neutralNames.has(name)
      ? "neutral"
      : masculineNames.has(name)
        ? "masculine"
        : "feminine",
  ]),
);
const surnames = [
  "Finch",
  "Moss",
  "Bell",
  "Reed",
  "Wilder",
  "Pike",
  "Holloway",
  "Hart",
  "Bramble",
  "Hayward",
  "Fox",
  "Meadow",
  "Wren",
  "Cooper",
  "Alder",
  "Clover",
  "Birch",
  "Goodwin",
  "Field",
  "Thistle",
  "Brooks",
  "Ash",
  "Whitlow",
  "Vale",
];
export function randomName(
  excluded: string[] = [],
  random = Math.random,
  portrait?: number,
) {
  const choices = firstNames
    .filter(
      (first) =>
        portrait === undefined ||
        nameCategories[first] === "neutral" ||
        nameCategories[first] === portraitCategories[portrait],
    )
    .flatMap((first) => surnames.map((last) => `${first} ${last}`))
    .filter((name) => !excluded.includes(name));
  return choices[Math.floor(random() * choices.length)];
}
export function randomParty(
  count: number,
  previous: Traveller[] = [],
  random = Math.random,
): Traveller[] {
  if (!Number.isInteger(count) || count < 2 || count > 6)
    throw new Error("A wagon needs 2–6 travellers.");
  const available = [...portraitSlots];
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  // Find a distinct face for everyone, including when rerolling a full wagon.
  const assign = (slots: number[]): number[] | undefined => {
    if (slots.length === count) return slots;
    for (const slot of available) {
      if (slots.includes(slot) || slot === previous[slots.length]?.portrait)
        continue;
      const result = assign([...slots, slot]);
      if (result) return result;
    }
    return;
  };
  const portraits = assign([])!;
  const used = previous.map((p) => p.name);
  return portraits.map((portrait) => {
    const name = randomName(used, random, portrait);
    used.push(name);
    return { name, portrait };
  });
}
