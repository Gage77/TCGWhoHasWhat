/**
 * Storage layer.
 *
 * Uses libSQL so the same code runs against a local SQLite file during
 * development and against a hosted Turso database once this is deployed for
 * the group — set TURSO_DATABASE_URL / TURSO_AUTH_TOKEN and nothing else
 * changes.
 */

import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";

import type { CollectionCard } from "./csv";
import { nameKeys, primaryKey } from "./normalize";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS owners (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    card_count  INTEGER NOT NULL DEFAULT 0,
    unique_cards INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS collection_cards (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id           TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    set_code           TEXT,
    collector_number   TEXT,
    quantity           INTEGER NOT NULL,
    tradelist_quantity INTEGER NOT NULL,
    finish             TEXT NOT NULL,
    condition          TEXT,
    language           TEXT,
    scryfall_id        TEXT
  )`,
  // One row per searchable name key, so split/DFC faces are all findable.
  `CREATE TABLE IF NOT EXISTS card_keys (
    card_id  INTEGER NOT NULL REFERENCES collection_cards(id) ON DELETE CASCADE,
    name_key TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS card_cache (
    lookup_key TEXT PRIMARY KEY,
    card_json  TEXT,
    fetched_at INTEGER NOT NULL
  )`,
  // A saved want list per person, so trades can be matched in both
  // directions without anyone re-pasting a list.
  `CREATE TABLE IF NOT EXISTS want_cards (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    quantity INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS want_keys (
    want_id  INTEGER NOT NULL REFERENCES want_cards(id) ON DELETE CASCADE,
    name_key TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_card_keys_key ON card_keys(name_key)`,
  `CREATE INDEX IF NOT EXISTS idx_want_keys_key ON want_keys(name_key)`,
  `CREATE INDEX IF NOT EXISTS idx_want_keys_want ON want_keys(want_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wants_owner ON want_cards(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_card_keys_card ON card_keys(card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_owner ON collection_cards(owner_id)`,
];

let clientPromise: Promise<Client> | null = null;

/** Cached across dev-server hot reloads so we do not leak connections. */
const globalForDb = globalThis as unknown as { __tcgDbClient?: Promise<Client> };

async function initClient(): Promise<Client> {
  const url = process.env.TURSO_DATABASE_URL;
  let client: Client;

  if (url) {
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  } else {
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    client = createClient({ url: `file:${path.join(dir, "collections.db")}` });
  }

  for (const statement of SCHEMA) {
    await client.execute(statement);
  }

  // Added after the initial release; databases created before it need the
  // column back-filled. SQLite has no "ADD COLUMN IF NOT EXISTS".
  try {
    await client.execute("ALTER TABLE owners ADD COLUMN source_url TEXT");
  } catch {
    // Already present.
  }

  await client.execute("PRAGMA foreign_keys = ON");

  return client;
}

export function getDb(): Promise<Client> {
  if (globalForDb.__tcgDbClient) return globalForDb.__tcgDbClient;
  clientPromise ??= initClient();
  globalForDb.__tcgDbClient = clientPromise;
  return clientPromise;
}

export interface Owner {
  id: string;
  name: string;
  cardCount: number;
  uniqueCards: number;
  updatedAt: string;
  /** Set for link imports, so the collection can be re-fetched later. */
  sourceUrl: string | null;
}

export async function listOwners(): Promise<Owner[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT id, name, card_count, unique_cards, updated_at, source_url
     FROM owners ORDER BY name COLLATE NOCASE`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    cardCount: Number(row.card_count),
    uniqueCards: Number(row.unique_cards),
    updatedAt: String(row.updated_at),
    sourceUrl: row.source_url ? String(row.source_url) : null,
  }));
}

export async function getOwner(ownerId: string): Promise<Owner | null> {
  const owners = await listOwners();
  return owners.find((owner) => owner.id === ownerId) ?? null;
}

/**
 * Replace an owner's collection wholesale. Re-uploading is the normal way to
 * refresh, so the old rows are cleared first; the owner id is stable across
 * uploads to keep any bookmarked links working.
 */
export async function replaceCollection(
  ownerName: string,
  cards: CollectionCard[],
  sourceUrl: string | null = null,
): Promise<Owner> {
  const db = await getDb();
  const name = ownerName.trim();

  const existing = await db.execute({
    sql: "SELECT id FROM owners WHERE name = ? COLLATE NOCASE",
    args: [name],
  });

  const ownerId = existing.rows.length > 0 ? String(existing.rows[0].id) : crypto.randomUUID();
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const uniqueCards = new Set(cards.map((card) => primaryKey(card.name))).size;
  const updatedAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO owners (id, name, card_count, unique_cards, updated_at, source_url)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            card_count = excluded.card_count,
            unique_cards = excluded.unique_cards,
            updated_at = excluded.updated_at,
            source_url = excluded.source_url`,
    args: [ownerId, name, totalCards, uniqueCards, updatedAt, sourceUrl],
  });

  await db.execute({ sql: "DELETE FROM collection_cards WHERE owner_id = ?", args: [ownerId] });

  // Batched inserts: a 20k-card collection is a normal size and one
  // statement per row would take minutes over a network-backed database.
  const CHUNK = 200;
  for (let i = 0; i < cards.length; i += CHUNK) {
    const chunk = cards.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const args = chunk.flatMap((card) => [
      ownerId,
      card.name,
      card.setCode,
      card.collectorNumber,
      card.quantity,
      card.tradelistQuantity,
      card.finish,
      card.condition,
      card.language,
      card.scryfallId,
    ]);

    const inserted = await db.execute({
      sql: `INSERT INTO collection_cards
              (owner_id, name, set_code, collector_number, quantity,
               tradelist_quantity, finish, condition, language, scryfall_id)
            VALUES ${placeholders}
            RETURNING id, name`,
      args,
    });

    const keyRows = inserted.rows.flatMap((row) =>
      nameKeys(String(row.name)).map((key) => ({ cardId: Number(row.id), key })),
    );

    for (let j = 0; j < keyRows.length; j += CHUNK) {
      const keyChunk = keyRows.slice(j, j + CHUNK);
      await db.execute({
        sql: `INSERT INTO card_keys (card_id, name_key) VALUES ${keyChunk
          .map(() => "(?, ?)")
          .join(", ")}`,
        args: keyChunk.flatMap((row) => [row.cardId, row.key]),
      });
    }
  }

  return { id: ownerId, name, cardCount: totalCards, uniqueCards, updatedAt, sourceUrl };
}

export async function deleteOwner(ownerId: string): Promise<void> {
  const db = await getDb();
  // Explicit child deletes: PRAGMA foreign_keys is per-connection and libSQL
  // pooling makes it unsafe to rely on cascade alone.
  await db.execute({
    sql: `DELETE FROM card_keys WHERE card_id IN
            (SELECT id FROM collection_cards WHERE owner_id = ?)`,
    args: [ownerId],
  });
  await db.execute({ sql: "DELETE FROM collection_cards WHERE owner_id = ?", args: [ownerId] });
  await db.execute({
    sql: `DELETE FROM want_keys WHERE want_id IN
            (SELECT id FROM want_cards WHERE owner_id = ?)`,
    args: [ownerId],
  });
  await db.execute({ sql: "DELETE FROM want_cards WHERE owner_id = ?", args: [ownerId] });
  await db.execute({ sql: "DELETE FROM owners WHERE id = ?", args: [ownerId] });
}

export interface CollectionHit {
  cardId: number;
  ownerId: string;
  ownerName: string;
  nameKey: string;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  tradelistQuantity: number;
  finish: string;
  condition: string | null;
  language: string | null;
  scryfallId: string | null;
}

/** Find every copy of the given name keys across all stored collections. */
export async function findCards(keys: string[]): Promise<CollectionHit[]> {
  if (keys.length === 0) return [];
  const db = await getDb();
  const hits: CollectionHit[] = [];

  // SQLite caps variables per statement; chunk the IN list.
  const CHUNK = 400;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const result = await db.execute({
      sql: `SELECT DISTINCT k.name_key, c.id, c.name, c.set_code, c.collector_number,
                   c.quantity, c.tradelist_quantity, c.finish, c.condition,
                   c.language, c.scryfall_id, o.id AS owner_id, o.name AS owner_name
            FROM card_keys k
            JOIN collection_cards c ON c.id = k.card_id
            JOIN owners o ON o.id = c.owner_id
            WHERE k.name_key IN (${chunk.map(() => "?").join(", ")})`,
      args: chunk,
    });

    for (const row of result.rows) {
      hits.push({
        cardId: Number(row.id),
        ownerId: String(row.owner_id),
        ownerName: String(row.owner_name),
        nameKey: String(row.name_key),
        name: String(row.name),
        setCode: row.set_code ? String(row.set_code) : null,
        collectorNumber: row.collector_number ? String(row.collector_number) : null,
        quantity: Number(row.quantity),
        tradelistQuantity: Number(row.tradelist_quantity),
        finish: String(row.finish),
        condition: row.condition ? String(row.condition) : null,
        language: row.language ? String(row.language) : null,
        scryfallId: row.scryfall_id ? String(row.scryfall_id) : null,
      });
    }
  }

  return hits;
}

export interface WantCard {
  id: number;
  name: string;
  quantity: number;
}

export async function listWants(ownerId: string): Promise<WantCard[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT id, name, quantity FROM want_cards WHERE owner_id = ? ORDER BY name COLLATE NOCASE",
    args: [ownerId],
  });
  return result.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    quantity: Number(row.quantity),
  }));
}

/** Replace someone's whole want list; an empty list simply clears it. */
export async function replaceWantList(
  ownerId: string,
  wants: Array<{ name: string; quantity: number }>,
): Promise<WantCard[]> {
  const db = await getDb();

  await db.execute({
    sql: `DELETE FROM want_keys WHERE want_id IN
            (SELECT id FROM want_cards WHERE owner_id = ?)`,
    args: [ownerId],
  });
  await db.execute({ sql: "DELETE FROM want_cards WHERE owner_id = ?", args: [ownerId] });

  const CHUNK = 200;
  for (let i = 0; i < wants.length; i += CHUNK) {
    const chunk = wants.slice(i, i + CHUNK);
    const inserted = await db.execute({
      sql: `INSERT INTO want_cards (owner_id, name, quantity)
            VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}
            RETURNING id, name`,
      args: chunk.flatMap((want) => [ownerId, want.name, want.quantity]),
    });

    const keyRows = inserted.rows.flatMap((row) =>
      nameKeys(String(row.name)).map((key) => ({ wantId: Number(row.id), key })),
    );
    if (keyRows.length > 0) {
      await db.execute({
        sql: `INSERT INTO want_keys (want_id, name_key) VALUES ${keyRows
          .map(() => "(?, ?)")
          .join(", ")}`,
        args: keyRows.flatMap((row) => [row.wantId, row.key]),
      });
    }
  }

  return listWants(ownerId);
}

/** How many cards each person has on their want list. */
export async function wantCounts(): Promise<Map<string, number>> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT owner_id, COUNT(*) AS n FROM want_cards GROUP BY owner_id",
  );
  return new Map(result.rows.map((row) => [String(row.owner_id), Number(row.n)]));
}

export interface WantMatch {
  wantId: number;
  wanterId: string;
  wantName: string;
  wantQuantity: number;
  holderId: string;
  holderName: string;
  cardId: number;
  cardName: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  tradelistQuantity: number;
  finish: string;
  condition: string | null;
  scryfallId: string | null;
}

/**
 * Every case of one person wanting a card another person owns.
 *
 * Done as a single join rather than per-person queries: a playgroup's want
 * lists and collections are both already indexed by normalized name key, so
 * the database can pair them up directly.
 */
export async function findWantMatches(): Promise<WantMatch[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT DISTINCT
       w.id AS want_id, w.owner_id AS wanter_id, w.name AS want_name, w.quantity AS want_quantity,
       c.id AS card_id, c.owner_id AS holder_id, o.name AS holder_name,
       c.name AS card_name, c.set_code, c.collector_number, c.quantity,
       c.tradelist_quantity, c.finish, c.condition, c.scryfall_id
     FROM want_keys wk
     JOIN want_cards w ON w.id = wk.want_id
     JOIN card_keys ck ON ck.name_key = wk.name_key
     JOIN collection_cards c ON c.id = ck.card_id
     JOIN owners o ON o.id = c.owner_id
     WHERE c.owner_id != w.owner_id`,
  );

  return result.rows.map((row) => ({
    wantId: Number(row.want_id),
    wanterId: String(row.wanter_id),
    wantName: String(row.want_name),
    wantQuantity: Number(row.want_quantity),
    holderId: String(row.holder_id),
    holderName: String(row.holder_name),
    cardId: Number(row.card_id),
    cardName: String(row.card_name),
    setCode: row.set_code ? String(row.set_code) : null,
    collectorNumber: row.collector_number ? String(row.collector_number) : null,
    quantity: Number(row.quantity),
    tradelistQuantity: Number(row.tradelist_quantity),
    finish: String(row.finish),
    condition: row.condition ? String(row.condition) : null,
    scryfallId: row.scryfall_id ? String(row.scryfall_id) : null,
  }));
}

export async function readCache(keys: string[], maxAgeMs: number) {
  if (keys.length === 0) return new Map<string, string | null>();
  const db = await getDb();
  const cutoff = Date.now() - maxAgeMs;
  const found = new Map<string, string | null>();

  const CHUNK = 400;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    const result = await db.execute({
      sql: `SELECT lookup_key, card_json FROM card_cache
            WHERE fetched_at > ? AND lookup_key IN (${chunk.map(() => "?").join(", ")})`,
      args: [cutoff, ...chunk],
    });
    for (const row of result.rows) {
      found.set(String(row.lookup_key), row.card_json === null ? null : String(row.card_json));
    }
  }

  return found;
}

export async function writeCache(entries: Array<[string, string | null]>): Promise<void> {
  if (entries.length === 0) return;
  const db = await getDb();
  const now = Date.now();

  const CHUNK = 200;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    await db.execute({
      sql: `INSERT INTO card_cache (lookup_key, card_json, fetched_at)
            VALUES ${chunk.map(() => "(?, ?, ?)").join(", ")}
            ON CONFLICT(lookup_key) DO UPDATE SET
              card_json = excluded.card_json,
              fetched_at = excluded.fetched_at`,
      args: chunk.flatMap(([key, json]) => [key, json, now]),
    });
  }
}
