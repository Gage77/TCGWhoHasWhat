/**
 * A card query, as a tree.
 *
 * Two things produce one of these: the filter controls in the viewer, and a
 * text box accepting a subset of the syntax people already know from Scryfall
 * (`c:u t:instant mv<=3`). Having both compile to the same tree is what stops
 * them being two filtering systems that disagree — the controls are a
 * discoverable way to build a query, not a separate feature.
 *
 * Deliberately a subset. Everything here is something you can reasonably
 * expect a playgroup to type; the long tail Scryfall supports — devotion
 * comparisons, `is:split`, arbitrary nesting of set-theoretic operators — is
 * not worth the surface, and a query using one says so rather than quietly
 * returning the wrong cards.
 *
 * No runtime imports: the tests load this file directly.
 */

/** How a numeric or ordered comparison was written. */
export type Comparator = "=" | "!=" | "<" | "<=" | ">" | ">=";

/**
 * How a colour term compares two sets of colours.
 *
 * `includes` is what a bare `c:u` means — the card is at least blue, possibly
 * more. `subset` is the one Commander players actually want: `id<=wu` is
 * "fits in my Azorius deck".
 */
export type ColorOp =
  | "exact"
  | "includes"
  | "subset"
  | "properSubset"
  | "properSuperset"
  /** Two or more colours, which is what `c:m` means and no operator captures. */
  | "multicolor";

export type Condition =
  /** Matched against the collection row's own name, so it works un-enriched. */
  | { field: "name"; value: string }
  | { field: "oracle"; value: string }
  | { field: "type"; value: string }
  | { field: "artist"; value: string }
  | { field: "keyword"; value: string }
  | { field: "set"; value: string }
  | { field: "condition"; value: string }
  | { field: "colors" | "identity"; op: ColorOp; colors: string }
  | { field: "cmc" | "power" | "toughness" | "loyalty" | "price" | "year" | "quantity"; cmp: Comparator; value: number }
  | { field: "rarity"; cmp: Comparator; value: string }
  /** Format legality, e.g. `f:commander`. */
  | { field: "format"; value: string }
  /** A yes/no property of the card or of this person's copy of it. */
  | { field: "is"; value: IsProperty };

export type QueryNode =
  | { kind: "term"; condition: Condition }
  | { kind: "not"; node: QueryNode }
  | { kind: "and"; nodes: QueryNode[] }
  | { kind: "or"; nodes: QueryNode[] };

export interface ParsedQuery {
  /** Null when the text held nothing to filter on. */
  node: QueryNode | null;
  /**
   * Anything dropped, in words a person can act on. Reported rather than
   * thrown: one unknown word in a long query should not blank the screen.
   */
  warnings: string[];
}

const IS_PROPERTIES = [
  "foil",
  "nonfoil",
  "etched",
  "tradeable",
  "reserved",
  "promo",
  "identified",
  "unidentified",
] as const;

export type IsProperty = (typeof IS_PROPERTIES)[number];

/** The rarities, weakest first, so `r>=rare` means something. */
export const RARITY_ORDER = ["common", "uncommon", "rare", "mythic"] as const;

/**
 * Colour shorthands.
 *
 * The guild and shard names are here because that is how players talk: nobody
 * asks for their "WU cards", they ask what Azorius stuff someone has.
 */
const COLOR_WORDS: Record<string, string> = {
  w: "W", white: "W",
  u: "U", blue: "U",
  b: "B", black: "B",
  r: "R", red: "R",
  g: "G", green: "G",

  azorius: "WU", dimir: "UB", rakdos: "BR", gruul: "RG", selesnya: "GW",
  orzhov: "WB", izzet: "UR", golgari: "BG", boros: "RW", simic: "GU",

  bant: "GWU", esper: "WUB", grixis: "UBR", jund: "BRG", naya: "RGW",
  abzan: "WBG", jeskai: "URW", sultai: "BGU", mardu: "RWB", temur: "GUR",
};

/** Field spellings people actually type, folded to one name each. */
const FIELD_ALIASES: Record<string, string> = {
  n: "name", name: "name",
  o: "oracle", oracle: "oracle", text: "oracle",
  t: "type", type: "type",
  c: "colors", color: "colors", colors: "colors", colour: "colors", colours: "colors",
  id: "identity", ci: "identity", identity: "identity", commander: "identity",
  cmc: "cmc", mv: "cmc", manavalue: "cmc",
  pow: "power", power: "power",
  tou: "toughness", toughness: "toughness",
  loy: "loyalty", loyalty: "loyalty",
  r: "rarity", rarity: "rarity",
  s: "set", e: "set", set: "set", edition: "set",
  kw: "keyword", keyword: "keyword",
  a: "artist", artist: "artist",
  f: "format", format: "format", legal: "format",
  usd: "price", price: "price",
  year: "year",
  qty: "quantity", count: "quantity",
  cond: "condition", condition: "condition",
  is: "is",
};

const NUMERIC_FIELDS = new Set(["cmc", "power", "toughness", "loyalty", "price", "year", "quantity"]);
const TEXT_FIELDS = new Set(["name", "oracle", "type", "artist", "keyword", "set", "condition"]);

type Token =
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "or" }
  | { type: "and" }
  | { type: "not" }
  | { type: "term"; text: string };

/**
 * Split the query into tokens.
 *
 * Quoted runs stay whole, so `o:"draw a card"` is one term rather than three,
 * and a `-` immediately before a term or a bracket is a negation rather than
 * part of a card name — which matters, because plenty of card names contain
 * one.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }

    // Negation only when it leads a term; "Chandra's Fire-Blast" keeps its own.
    if (char === "-" && i + 1 < input.length && !/[\s)]/.test(input[i + 1])) {
      tokens.push({ type: "not" });
      i++;
      continue;
    }

    // One term: everything up to whitespace or a bracket, except inside quotes.
    let text = "";
    let quoted = false;

    while (i < input.length) {
      const c = input[i];
      if (c === '"') {
        quoted = !quoted;
        i++;
        continue;
      }
      if (!quoted && (/\s/.test(c) || c === "(" || c === ")")) break;
      text += c;
      i++;
    }

    if (text === "") continue;

    const lowered = text.toLowerCase();
    if (lowered === "or") tokens.push({ type: "or" });
    else if (lowered === "and") tokens.push({ type: "and" });
    else tokens.push({ type: "term", text });
  }

  return tokens;
}

/** Split `key:value` into its parts, or null for a bare word. */
function splitTerm(text: string): { key: string; cmp: Comparator; value: string } | null {
  const match = /^([A-Za-z]+)(>=|<=|!=|[:=<>])(.*)$/.exec(text);
  if (!match) return null;

  const [, key, rawCmp, value] = match;
  // A colon means "matches" for text and "is at least" for colours; both are
  // recorded as `=` and given meaning by the field.
  const cmp = (rawCmp === ":" ? "=" : rawCmp) as Comparator;
  return { key: key.toLowerCase(), cmp, value };
}

function colorTerm(
  field: "colors" | "identity",
  rawCmp: Comparator,
  colon: boolean,
  value: string,
): Condition | string {
  const lowered = value.toLowerCase();

  if (lowered === "c" || lowered === "colorless" || lowered === "colourless") {
    return { field, op: "exact", colors: "" };
  }
  if (lowered === "m" || lowered === "multicolor" || lowered === "multicolour") {
    // Two or more, so a mono-red card is not "multicolour" on a technicality.
    return { field, op: "multicolor", colors: "" };
  }

  const named = COLOR_WORDS[lowered];
  let colors: string;

  if (named) {
    colors = named;
  } else if (/^[wubrg]+$/.test(lowered)) {
    colors = lowered.toUpperCase();
  } else {
    return `"${value}" is not a colour. Try w, u, b, r, g, a combination like wu, or a guild name.`;
  }

  const op: ColorOp =
    colon || rawCmp === ">=" ? "includes"
    : rawCmp === "=" ? "exact"
    : rawCmp === "<=" ? "subset"
    : rawCmp === "<" ? "properSubset"
    : rawCmp === ">" ? "properSuperset"
    : "includes";

  return { field, op, colors: sortColors(colors) };
}

/** WUBRG order, matching how `card_facts.colors` is stored. */
function sortColors(colors: string): string {
  const present = new Set(colors.toUpperCase());
  return [..."WUBRG"].filter((letter) => present.has(letter)).join("");
}

/** Turn one token's text into a condition, or into a reason it was dropped. */
function toCondition(text: string): Condition | string {
  const split = splitTerm(text);

  // A bare word searches names, which is what someone typing "bolt" wants.
  if (!split) return { field: "name", value: text };

  const field = FIELD_ALIASES[split.key];
  if (!field) {
    return `"${split.key}:" is not a filter this understands, so that part was ignored.`;
  }
  if (split.value === "") {
    return `"${split.key}:" was given nothing to match, so that part was ignored.`;
  }

  const colon = /^[A-Za-z]+:/.test(text);

  if (field === "colors" || field === "identity") {
    return colorTerm(field, split.cmp, colon, split.value);
  }

  if (field === "is") {
    const value = split.value.toLowerCase();
    if ((IS_PROPERTIES as readonly string[]).includes(value)) {
      return { field: "is", value: value as IsProperty };
    }
    return `"is:${split.value}" is not something this can check. Known: ${IS_PROPERTIES.join(", ")}.`;
  }

  if (field === "rarity") {
    const value = split.value.toLowerCase();
    const full = RARITY_ORDER.find((rarity) => rarity.startsWith(value));
    if (!full) return `"${split.value}" is not a rarity.`;
    return { field: "rarity", cmp: split.cmp, value: full };
  }

  if (field === "format") {
    const value = split.value.toLowerCase();
    if (!/^[a-z]+$/.test(value)) return `"${split.value}" is not a format name.`;
    return { field: "format", value };
  }

  if (NUMERIC_FIELDS.has(field)) {
    const value = Number.parseFloat(split.value);
    if (!Number.isFinite(value)) {
      return `"${split.key}:" needs a number, and "${split.value}" is not one.`;
    }
    return {
      field: field as "cmc" | "power" | "toughness" | "loyalty" | "price" | "year" | "quantity",
      cmp: split.cmp,
      value,
    };
  }

  if (TEXT_FIELDS.has(field)) {
    return {
      field: field as "name" | "oracle" | "type" | "artist" | "keyword" | "set" | "condition",
      value: split.value,
    };
  }

  return `"${split.key}:" is not a filter this understands, so that part was ignored.`;
}

/**
 * Parse a query.
 *
 * Recursive descent over `or` of `and` of possibly-negated terms and bracketed
 * groups. Terms sitting next to each other are an implicit `and`, which is how
 * everyone writes these.
 */
export function parseQuery(input: string): ParsedQuery {
  const warnings: string[] = [];
  const tokens = tokenize(input);
  let position = 0;

  function peek(): Token | undefined {
    return tokens[position];
  }

  function parseOr(): QueryNode | null {
    const nodes: QueryNode[] = [];
    let next = parseAnd();
    if (next) nodes.push(next);

    while (peek()?.type === "or") {
      position++;
      next = parseAnd();
      if (next) nodes.push(next);
    }

    if (nodes.length === 0) return null;
    return nodes.length === 1 ? nodes[0] : { kind: "or", nodes };
  }

  function parseAnd(): QueryNode | null {
    const nodes: QueryNode[] = [];

    for (;;) {
      const token = peek();
      if (!token || token.type === "or" || token.type === "rparen") break;

      if (token.type === "and") {
        position++;
        continue;
      }

      const next = parseUnary();
      if (next) nodes.push(next);
    }

    if (nodes.length === 0) return null;
    return nodes.length === 1 ? nodes[0] : { kind: "and", nodes };
  }

  function parseUnary(): QueryNode | null {
    const token = peek();
    if (!token) return null;

    if (token.type === "not") {
      position++;
      const node = parseUnary();
      return node ? { kind: "not", node } : null;
    }

    if (token.type === "lparen") {
      position++;
      const node = parseOr();
      if (peek()?.type === "rparen") position++;
      else warnings.push("A bracket was left open; it was closed for you at the end.");
      return node;
    }

    if (token.type === "rparen") {
      position++;
      warnings.push("A closing bracket had nothing to close, so it was ignored.");
      return null;
    }

    position++;
    if (token.type !== "term") return null;

    const condition = toCondition(token.text);
    if (typeof condition === "string") {
      warnings.push(condition);
      return null;
    }
    return { kind: "term", condition };
  }

  const node = parseOr();

  // Anything left means the brackets did not balance; the rest is unreachable
  // by the grammar, so say so rather than filtering on half a query.
  if (position < tokens.length) {
    warnings.push("Part of that query could not be read and was ignored.");
  }

  return { node, warnings };
}
