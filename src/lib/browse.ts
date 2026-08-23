/**
 * Reading one person's collection, filtered.
 *
 * The join is a LEFT one and stays that way: a collection nobody has finished
 * identifying still lists, and its rows are still searchable by name, set and
 * quantity — the columns that came out of the export rather than out of
 * Scryfall. Filters that need facts simply do not match those rows, which is
 * what the "still identifying" count exists to explain.
 */

import { compileQuery, PRICE_FOR_FINISH, SORTS, type SortKey } from "./cardQuerySql";
import { getDb } from "./db";
import type { QueryNode } from "./cardQuery";

/** One row of somebody's collection, with whatever is known about the card. */
export interface BrowseCard {
  id: number;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  tradelistQuantity: number;
  finish: string;
  condition: string | null;
  /** False when this row has not been identified, so facts below are null. */
  identified: boolean;
  setName: string | null;
  rarity: string | null;
  manaCost: string | null;
  cmc: number | null;
  colors: string | null;
  colorIdentity: string | null;
  typeLine: string | null;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  imageSmall: string | null;
  imageNormal: string | null;
  /** Price for the finish this person actually holds. */
  price: number | null;
  scryfallId: string | null;
}

export interface BrowseOptions {
  /** Compiled from the query box, the filter controls, or both. */
  filter?: QueryNode | null;
  sort?: SortKey;
  limit?: number;
  offset?: number;
}

export interface BrowsePage {
  cards: BrowseCard[];
  /** Rows matching the filter, not just the ones on this page. */
  total: number;
  /** Copies those rows account for — a playset is one row and four cards. */
  totalCopies: number;
  /** Combined value of the matching copies. */
  totalValue: number;
  /** True when more rows follow this page. */
  hasMore: boolean;
}

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

const COLUMNS = `
  c.id, c.name, c.set_code, c.collector_number, c.quantity, c.tradelist_quantity,
  c.finish, c.condition, c.facts_id, c.scryfall_id,
  f.set_name, f.rarity, f.mana_cost, f.cmc, f.colors, f.color_identity,
  f.type_line, f.oracle_text, f.power, f.toughness, f.image_small, f.image_normal,
  ${PRICE_FOR_FINISH} AS price`;

export async function browseCollection(
  ownerId: string,
  options: BrowseOptions = {},
): Promise<BrowsePage> {
  const db = await getDb();

  const filter = options.filter ? compileQuery(options.filter) : null;
  const where = filter ? `c.owner_id = ? AND ${filter.sql}` : `c.owner_id = ?`;
  const whereArgs: Array<string | number> = [ownerId, ...(filter?.args ?? [])];

  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(options.offset ?? 0, 0);
  const order = SORTS[options.sort ?? "name"];

  // One extra row rather than a second count query, to know whether the
  // "load more" at the bottom of the grid has anything behind it.
  const [page, totals] = await db.batch(
    [
      {
        sql: `SELECT ${COLUMNS}
              FROM collection_cards c
              LEFT JOIN card_facts f ON f.scryfall_id = c.facts_id
              WHERE ${where}
              ORDER BY ${order}
              LIMIT ? OFFSET ?`,
        args: [...whereArgs, limit + 1, offset],
      },
      {
        sql: `SELECT COUNT(*) AS rows,
                     COALESCE(SUM(c.quantity), 0) AS copies,
                     COALESCE(SUM(c.quantity * ${PRICE_FOR_FINISH}), 0) AS value
              FROM collection_cards c
              LEFT JOIN card_facts f ON f.scryfall_id = c.facts_id
              WHERE ${where}`,
        args: whereArgs,
      },
    ],
    "read",
  );

  const hasMore = page.rows.length > limit;
  const rows = hasMore ? page.rows.slice(0, limit) : page.rows;
  const summary = totals.rows[0];

  return {
    cards: rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      setCode: row.set_code ? String(row.set_code) : null,
      collectorNumber: row.collector_number ? String(row.collector_number) : null,
      quantity: Number(row.quantity),
      tradelistQuantity: Number(row.tradelist_quantity),
      finish: String(row.finish),
      condition: row.condition ? String(row.condition) : null,
      identified: row.facts_id !== null,
      setName: row.set_name ? String(row.set_name) : null,
      rarity: row.rarity ? String(row.rarity) : null,
      manaCost: row.mana_cost ? String(row.mana_cost) : null,
      cmc: row.cmc === null ? null : Number(row.cmc),
      colors: row.colors === null ? null : String(row.colors),
      colorIdentity: row.color_identity === null ? null : String(row.color_identity),
      typeLine: row.type_line ? String(row.type_line) : null,
      oracleText: row.oracle_text ? String(row.oracle_text) : null,
      power: row.power ? String(row.power) : null,
      toughness: row.toughness ? String(row.toughness) : null,
      imageSmall: row.image_small ? String(row.image_small) : null,
      imageNormal: row.image_normal ? String(row.image_normal) : null,
      price: row.price === null ? null : Number(row.price),
      scryfallId: row.scryfall_id ? String(row.scryfall_id) : null,
    })),
    total: Number(summary?.rows ?? 0),
    totalCopies: Number(summary?.copies ?? 0),
    totalValue: Number(summary?.value ?? 0),
    hasMore,
  };
}

/**
 * What is in a collection, for building the filter controls.
 *
 * The controls are worth showing only for what someone actually holds — a set
 * dropdown listing every Magic set ever printed is not a filter, it is a
 * catalogue. Counted after no filtering at all, so the options do not vanish
 * as they are used.
 */
export interface CollectionFacets {
  sets: Array<{ code: string; name: string | null; count: number }>;
  rarities: Array<{ rarity: string; count: number }>;
  types: Array<{ type: string; count: number }>;
  colors: Array<{ color: string; count: number }>;
}

/** The card types worth offering, in the order a player would look for them. */
const CARD_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Land",
  "Battle",
];

export async function collectionFacets(ownerId: string): Promise<CollectionFacets> {
  const db = await getDb();

  const [sets, rarities, colors, types] = await db.batch(
    [
      {
        sql: `SELECT COALESCE(f.set_code, c.set_code) AS code,
                     MAX(f.set_name) AS name,
                     COUNT(*) AS count
              FROM collection_cards c
              LEFT JOIN card_facts f ON f.scryfall_id = c.facts_id
              WHERE c.owner_id = ? AND COALESCE(f.set_code, c.set_code) IS NOT NULL
              GROUP BY code
              ORDER BY count DESC, code ASC`,
        args: [ownerId],
      },
      {
        sql: `SELECT f.rarity AS rarity, COUNT(*) AS count
              FROM collection_cards c
              JOIN card_facts f ON f.scryfall_id = c.facts_id
              WHERE c.owner_id = ?
              GROUP BY f.rarity`,
        args: [ownerId],
      },
      {
        // One row per colour letter, counted by how many cards contain it.
        sql: `SELECT letter, COUNT(*) AS count FROM (
                SELECT 'W' AS letter, c.id FROM collection_cards c JOIN card_facts f ON f.scryfall_id = c.facts_id WHERE c.owner_id = ? AND f.colors LIKE '%W%'
                UNION ALL
                SELECT 'U', c.id FROM collection_cards c JOIN card_facts f ON f.scryfall_id = c.facts_id WHERE c.owner_id = ? AND f.colors LIKE '%U%'
                UNION ALL
                SELECT 'B', c.id FROM collection_cards c JOIN card_facts f ON f.scryfall_id = c.facts_id WHERE c.owner_id = ? AND f.colors LIKE '%B%'
                UNION ALL
                SELECT 'R', c.id FROM collection_cards c JOIN card_facts f ON f.scryfall_id = c.facts_id WHERE c.owner_id = ? AND f.colors LIKE '%R%'
                UNION ALL
                SELECT 'G', c.id FROM collection_cards c JOIN card_facts f ON f.scryfall_id = c.facts_id WHERE c.owner_id = ? AND f.colors LIKE '%G%'
                UNION ALL
                SELECT 'C', c.id FROM collection_cards c JOIN card_facts f ON f.scryfall_id = c.facts_id WHERE c.owner_id = ? AND f.colors = ''
              ) GROUP BY letter`,
        args: new Array(6).fill(ownerId),
      },
      {
        sql: `SELECT ${CARD_TYPES.map(
          (type) =>
            `SUM(CASE WHEN f.type_line LIKE '%${type}%' THEN 1 ELSE 0 END) AS "${type}"`,
        ).join(", ")}
              FROM collection_cards c
              JOIN card_facts f ON f.scryfall_id = c.facts_id
              WHERE c.owner_id = ?`,
        args: [ownerId],
      },
    ],
    "read",
  );

  const typeRow = types.rows[0];

  return {
    sets: sets.rows.map((row) => ({
      code: String(row.code),
      name: row.name ? String(row.name) : null,
      count: Number(row.count),
    })),
    rarities: rarities.rows
      .filter((row) => row.rarity !== null)
      .map((row) => ({ rarity: String(row.rarity), count: Number(row.count) })),
    colors: colors.rows.map((row) => ({
      color: String(row.letter),
      count: Number(row.count),
    })),
    types: CARD_TYPES.map((type) => ({
      type,
      count: Number(typeRow?.[type] ?? 0),
    })).filter((entry) => entry.count > 0),
  };
}
