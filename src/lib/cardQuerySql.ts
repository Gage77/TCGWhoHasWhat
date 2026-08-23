/**
 * Turning a query tree into SQL.
 *
 * Filtering happens in the database rather than in the browser because a
 * 20,000-card collection is a normal size here, and shipping one to a phone so
 * it can hide most of it is not a plan. Every value is a bound parameter; the
 * only text this file interpolates is column names it chose itself.
 *
 * The tables are aliased `c` for the collection row and `f` for the card
 * facts, joined by the caller. That join is a LEFT one — a collection whose
 * cards have not been identified yet still lists, it just cannot be filtered
 * on anything except its own names and quantities.
 *
 * No runtime imports: the tests load this file directly.
 */

import type { ColorOp, Comparator, Condition, QueryNode } from "./cardQuery";

export interface CompiledQuery {
  /** A boolean expression, safe to drop into a WHERE clause. */
  sql: string;
  args: Array<string | number>;
}

/**
 * The price of the finish someone actually owns.
 *
 * A foil is not worth what the ordinary printing is, so a filter for "their
 * stuff over $10" that reads the plain price gets foils wrong in both
 * directions. Falls back the way the search tab does, since foil-only promos
 * carry no plain price at all.
 *
 * Exported because the browse query sorts and totals by the same number;
 * filtering by one price and displaying another would be its own bug.
 */
export const PRICE_FOR_FINISH = `COALESCE(
  CASE c.finish
    WHEN 'foil' THEN f.usd_foil
    WHEN 'etched' THEN f.usd_etched
    ELSE f.usd
  END,
  f.usd, f.usd_foil, f.usd_etched
)`;

/** Rarity is ordered, not just labelled, so `r>=rare` can mean something. */
const RARITY_RANK =
  `CASE f.rarity WHEN 'common' THEN 0 WHEN 'uncommon' THEN 1 ` +
  `WHEN 'rare' THEN 2 WHEN 'mythic' THEN 3 ELSE -1 END`;

/** Columns that hold a number written as text, so they need coercing. */
const NUMERIC_COLUMNS: Record<string, string> = {
  cmc: "f.cmc",
  price: PRICE_FOR_FINISH,
  quantity: "c.quantity",
  // Power and toughness are text because of `*` and `1+*`; those cast to 0,
  // which is also roughly how they compare on a battlefield.
  power: "CAST(f.power AS REAL)",
  toughness: "CAST(f.toughness AS REAL)",
  loyalty: "CAST(f.loyalty AS REAL)",
  year: "CAST(substr(f.released_at, 1, 4) AS INTEGER)",
};

const TEXT_COLUMNS: Record<string, string> = {
  // The collection row's own name, not the facts', so a bare word search
  // works on a collection that has not been identified yet.
  name: "c.name",
  oracle: "f.oracle_text",
  type: "f.type_line",
  artist: "f.artist",
  keyword: "f.keywords",
};

/** Escape the wildcards so a card called "Ach! Hans, Run!" searches literally. */
function likeValue(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function comparison(column: string, cmp: Comparator, value: number): CompiledQuery {
  return { sql: `${column} ${cmp === "=" ? "=" : cmp} ?`, args: [value] };
}

/**
 * Colour comparisons over the sorted WUBRG string.
 *
 * "Contains blue" is a `LIKE`, and "fits in these colours" is the absence of
 * every letter that is not one of them — which is why the colours are stored
 * as a string in a fixed order rather than as rows in a join table.
 */
function colorCondition(column: string, op: ColorOp, colors: string): CompiledQuery {
  const letters = [...colors];
  const others = [..."WUBRG"].filter((letter) => !colors.includes(letter));

  const contains = (set: string[]) =>
    set.map(() => `${column} LIKE ?`).join(" AND ") || "1";
  const lacks = (set: string[]) =>
    set.map(() => `${column} NOT LIKE ?`).join(" AND ") || "1";

  switch (op) {
    case "exact":
      return { sql: `${column} = ?`, args: [colors] };

    case "multicolor":
      return { sql: `LENGTH(${column}) >= 2`, args: [] };

    case "includes":
      return { sql: `(${contains(letters)})`, args: letters.map((l) => `%${l}%`) };

    case "subset":
      return { sql: `(${lacks(others)})`, args: others.map((l) => `%${l}%`) };

    case "properSubset":
      return {
        sql: `(${lacks(others)} AND ${column} <> ?)`,
        args: [...others.map((l) => `%${l}%`), colors],
      };

    case "properSuperset":
      return {
        sql: `(${contains(letters)} AND ${column} <> ?)`,
        args: [...letters.map((l) => `%${l}%`), colors],
      };
  }
}

function compileCondition(condition: Condition): CompiledQuery {
  switch (condition.field) {
    case "name":
    case "oracle":
    case "type":
    case "artist":
      return {
        sql: `${TEXT_COLUMNS[condition.field]} LIKE ? ESCAPE '\\'`,
        args: [likeValue(condition.value)],
      };

    case "keyword":
      // Keywords are a JSON array of exact words, so match the quoted word
      // rather than a substring: "Flying" must not be found inside "Flying
      // Men" or any other keyword that happens to contain it.
      return {
        sql: `f.keywords LIKE ? ESCAPE '\\'`,
        args: [`%"${condition.value.replace(/[\\%_"]/g, (c) => `\\${c}`)}"%`],
      };

    case "set":
      // Falls back to the row's own set code, so this works before the card
      // has been identified.
      return {
        sql: `COALESCE(f.set_code, c.set_code) = ? COLLATE NOCASE`,
        args: [condition.value],
      };

    case "condition":
      return { sql: `c.condition = ? COLLATE NOCASE`, args: [condition.value] };

    case "colors":
      return colorCondition("f.colors", condition.op, condition.colors);

    case "identity":
      return colorCondition("f.color_identity", condition.op, condition.colors);

    case "cmc":
    case "power":
    case "toughness":
    case "loyalty":
    case "price":
    case "year":
    case "quantity":
      return comparison(NUMERIC_COLUMNS[condition.field], condition.cmp, condition.value);

    case "rarity": {
      const rank = ["common", "uncommon", "rare", "mythic"].indexOf(condition.value);
      return { sql: `${RARITY_RANK} ${condition.cmp} ?`, args: [rank] };
    }

    case "format":
      // Restricted counts as playable: `f:vintage` should not hide the Power.
      return {
        sql: `json_extract(f.legalities, ?) IN ('legal', 'restricted')`,
        args: [`$.${condition.value}`],
      };

    case "is":
      switch (condition.value) {
        case "foil":
          return { sql: `c.finish = 'foil'`, args: [] };
        case "nonfoil":
          return { sql: `c.finish = 'normal'`, args: [] };
        case "etched":
          return { sql: `c.finish = 'etched'`, args: [] };
        case "tradeable":
          return { sql: `c.tradelist_quantity > 0`, args: [] };
        case "reserved":
          return { sql: `f.reserved = 1`, args: [] };
        case "promo":
          return { sql: `f.promo = 1`, args: [] };
        case "identified":
          return { sql: `c.facts_id IS NOT NULL`, args: [] };
        case "unidentified":
          return { sql: `c.facts_id IS NULL`, args: [] };
      }
  }
}

/**
 * Compile a query tree to one boolean expression.
 *
 * Negation coalesces first, so that `-t:creature` includes cards nobody has
 * identified yet. Comparing against a missing type line gives NULL, and a
 * plain `NOT NULL` is still NULL — which would drop those rows out of both
 * halves of a filter and its opposite, leaving people to wonder where their
 * cards went. Showing them under the negative is the honest answer to "is this
 * a creature?" being "we do not know yet".
 */
export function compileQuery(node: QueryNode): CompiledQuery {
  switch (node.kind) {
    case "term":
      return compileCondition(node.condition);

    case "not": {
      const inner = compileQuery(node.node);
      return { sql: `(NOT COALESCE(${inner.sql}, 0))`, args: inner.args };
    }

    case "and":
    case "or": {
      const parts = node.nodes.map(compileQuery);
      const joiner = node.kind === "and" ? " AND " : " OR ";
      return {
        sql: `(${parts.map((part) => part.sql).join(joiner)})`,
        args: parts.flatMap((part) => part.args),
      };
    }
  }
}

/** How a collection can be ordered, and the expression that does it. */
export const SORTS = {
  name: "c.name COLLATE NOCASE ASC",
  price: `${PRICE_FOR_FINISH} DESC NULLS LAST, c.name COLLATE NOCASE ASC`,
  cheapest: `${PRICE_FOR_FINISH} ASC NULLS LAST, c.name COLLATE NOCASE ASC`,
  cmc: "f.cmc ASC NULLS LAST, c.name COLLATE NOCASE ASC",
  rarity: `${RARITY_RANK} DESC, c.name COLLATE NOCASE ASC`,
  released: "f.released_at DESC NULLS LAST, c.name COLLATE NOCASE ASC",
  quantity: "c.quantity DESC, c.name COLLATE NOCASE ASC",
  color: "f.colors ASC NULLS LAST, f.cmc ASC, c.name COLLATE NOCASE ASC",
} as const;

export type SortKey = keyof typeof SORTS;

export function isSortKey(value: string): value is SortKey {
  return Object.prototype.hasOwnProperty.call(SORTS, value);
}
