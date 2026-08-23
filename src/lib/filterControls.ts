/**
 * The filter controls, as a query.
 *
 * Chips and ranges do not filter anything themselves — they write a query in
 * the same syntax the text box takes, and that one query is what runs. So
 * ticking "Creature" and typing `t:creature` do exactly the same thing, the
 * two compose instead of fighting, and there is a single parser and a single
 * compiler to be right.
 *
 * Groups are OR-ed inside and AND-ed between, which is what a facet list means
 * everywhere else: three rarities ticked widens the results, a rarity plus a
 * colour narrows them.
 *
 * No runtime imports: the tests load this file directly.
 */

export interface FilterControls {
  /** WUBRG letters, plus "C" for colourless. */
  colors: string[];
  /** Card types, as they appear in a type line. */
  types: string[];
  rarities: string[];
  /** Set codes. */
  sets: string[];
  mvMin: number | null;
  mvMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  /** Only copies their owner has flagged as available. */
  tradeableOnly: boolean;
  foilOnly: boolean;
}

export const EMPTY_CONTROLS: FilterControls = {
  colors: [],
  types: [],
  rarities: [],
  sets: [],
  mvMin: null,
  mvMax: null,
  priceMin: null,
  priceMax: null,
  tradeableOnly: false,
  foilOnly: false,
};

/** `(a or b)` for several, the bare term for one, nothing for none. */
function anyOf(terms: string[]): string | null {
  if (terms.length === 0) return null;
  if (terms.length === 1) return terms[0];
  return `(${terms.join(" or ")})`;
}

/** A value that has to survive being written into a query and read back. */
function quoted(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function controlsToQuery(controls: FilterControls): string {
  const parts: Array<string | null> = [
    anyOf(controls.colors.map((color) => `c:${color.toLowerCase()}`)),
    anyOf(controls.types.map((type) => `t:${quoted(type.toLowerCase())}`)),
    anyOf(controls.rarities.map((rarity) => `r:${rarity.toLowerCase()}`)),
    anyOf(controls.sets.map((set) => `s:${set.toLowerCase()}`)),
    controls.mvMin === null ? null : `mv>=${controls.mvMin}`,
    controls.mvMax === null ? null : `mv<=${controls.mvMax}`,
    controls.priceMin === null ? null : `usd>=${controls.priceMin}`,
    controls.priceMax === null ? null : `usd<=${controls.priceMax}`,
    controls.tradeableOnly ? "is:tradeable" : null,
    controls.foilOnly ? "is:foil" : null,
  ];

  return parts.filter((part): part is string => part !== null).join(" ");
}

/** Everything the viewer is filtering by, as one query for the API. */
export function fullQuery(text: string, controls: FilterControls): string {
  return [text.trim(), controlsToQuery(controls)].filter(Boolean).join(" ");
}

/** How many controls are doing something, for the badge on the button. */
export function activeFilterCount(controls: FilterControls): number {
  return (
    controls.colors.length +
    controls.types.length +
    controls.rarities.length +
    controls.sets.length +
    (controls.mvMin === null ? 0 : 1) +
    (controls.mvMax === null ? 0 : 1) +
    (controls.priceMin === null ? 0 : 1) +
    (controls.priceMax === null ? 0 : 1) +
    (controls.tradeableOnly ? 1 : 0) +
    (controls.foilOnly ? 1 : 0)
  );
}

function list(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read the controls out of a URL.
 *
 * The filter lives in the address bar rather than in component state, so a
 * filtered collection is a link — "here is what I have that fits your deck"
 * is a thing people want to send each other, and the back button ought to undo
 * a filter rather than leave the page.
 */
export function readControls(params: URLSearchParams): FilterControls {
  return {
    colors: list(params.get("colors")),
    types: list(params.get("types")),
    rarities: list(params.get("rarity")),
    sets: list(params.get("sets")),
    mvMin: num(params.get("mvmin")),
    mvMax: num(params.get("mvmax")),
    priceMin: num(params.get("pricemin")),
    priceMax: num(params.get("pricemax")),
    tradeableOnly: params.get("trade") === "1",
    foilOnly: params.get("foil") === "1",
  };
}

/** The inverse, writing only what is set so the URL stays readable. */
export function writeControls(controls: FilterControls): Record<string, string> {
  const params: Record<string, string> = {};

  if (controls.colors.length) params.colors = controls.colors.join(",");
  if (controls.types.length) params.types = controls.types.join(",");
  if (controls.rarities.length) params.rarity = controls.rarities.join(",");
  if (controls.sets.length) params.sets = controls.sets.join(",");
  if (controls.mvMin !== null) params.mvmin = String(controls.mvMin);
  if (controls.mvMax !== null) params.mvmax = String(controls.mvMax);
  if (controls.priceMin !== null) params.pricemin = String(controls.priceMin);
  if (controls.priceMax !== null) params.pricemax = String(controls.priceMax);
  if (controls.tradeableOnly) params.trade = "1";
  if (controls.foilOnly) params.foil = "1";

  return params;
}

/** Add or remove one value from a multi-select group. */
export function toggle(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}
