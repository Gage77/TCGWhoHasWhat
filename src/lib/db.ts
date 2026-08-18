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

const TABLES = [
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
  // Want lists are named and there can be several per person, because a want
  // is really "for my Atraxa deck" rather than an undifferentiated pile.
  `CREATE TABLE IF NOT EXISTS want_lists (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // A saved want, so trades can be matched in both directions without anyone
  // re-pasting a list. `owner_id` is denormalized off the list to keep the
  // matching join to one hop.
  `CREATE TABLE IF NOT EXISTS want_cards (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id         TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    list_id          TEXT REFERENCES want_lists(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    name_key         TEXT,
    quantity         INTEGER NOT NULL,
    priority         INTEGER NOT NULL DEFAULT 0,
    set_code         TEXT,
    collector_number TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS want_keys (
    want_id  INTEGER NOT NULL REFERENCES want_cards(id) ON DELETE CASCADE,
    name_key TEXT NOT NULL
  )`,
];

// Separate from the tables because an index can name a column that only
// exists after the ALTER TABLE migrations below have run.
const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_card_keys_key ON card_keys(name_key)`,
  `CREATE INDEX IF NOT EXISTS idx_want_keys_key ON want_keys(name_key)`,
  `CREATE INDEX IF NOT EXISTS idx_want_keys_want ON want_keys(want_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wants_owner ON want_cards(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wants_list ON want_cards(list_id)`,
  `CREATE INDEX IF NOT EXISTS idx_want_lists_owner ON want_lists(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_card_keys_card ON card_keys(card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_owner ON collection_cards(owner_id)`,
];

// Columns added after the initial release; databases created before them need
// them back-filled. SQLite has no "ADD COLUMN IF NOT EXISTS".
const ADDED_COLUMNS: Array<[string, string]> = [
  ["owners", "source_url TEXT"],
  ["want_cards", "list_id TEXT"],
  ["want_cards", "name_key TEXT"],
  ["want_cards", "priority INTEGER NOT NULL DEFAULT 0"],
  ["want_cards", "set_code TEXT"],
  ["want_cards", "collector_number TEXT"],
];

/**
 * A cheap fingerprint of everything `initClient` applies.
 *
 * The connection is cached on globalThis so dev-server hot reloads do not leak
 * connections. Without a key that changes, though, editing the schema reloads
 * the *queries* while leaving the old connection — and its un-migrated
 * database — in place, so every query fails against a shape that was never
 * updated. Keying the cache on the schema re-runs setup exactly when it
 * changes and never otherwise.
 */
const SCHEMA_FINGERPRINT = fingerprint(
  [...TABLES, ...ADDED_COLUMNS.map(([table, column]) => `${table} ${column}`), ...INDEXES].join(
    "\n",
  ),
);

function fingerprint(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const globalForDb = globalThis as unknown as {
  __tcgDb?: { schema: string; client: Promise<Client> };
};

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

  for (const statement of TABLES) {
    await client.execute(statement);
  }

  for (const [table, column] of ADDED_COLUMNS) {
    try {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column}`);
    } catch {
      // Already present.
    }
  }

  for (const statement of INDEXES) {
    await client.execute(statement);
  }

  await migrateLooseWants(client);

  await client.execute("PRAGMA foreign_keys = ON");

  return client;
}

/**
 * Move wants saved before lists existed into a list of their own.
 *
 * Everything downstream addresses wants through a list, so a want with no
 * list would silently vanish from the trade tab of anyone who had saved one.
 */
async function migrateLooseWants(client: Client): Promise<void> {
  const loose = await client.execute(
    "SELECT DISTINCT owner_id FROM want_cards WHERE list_id IS NULL",
  );

  for (const row of loose.rows) {
    const ownerId = String(row.owner_id);
    const listId = crypto.randomUUID();
    await client.execute({
      sql: "INSERT INTO want_lists (id, owner_id, name, updated_at) VALUES (?, ?, ?, ?)",
      args: [listId, ownerId, DEFAULT_LIST_NAME, new Date().toISOString()],
    });
    await client.execute({
      sql: "UPDATE want_cards SET list_id = ? WHERE owner_id = ? AND list_id IS NULL",
      args: [listId, ownerId],
    });
  }

  // Name keys arrived with lists; fill them in for any row that predates them.
  const unkeyed = await client.execute(
    "SELECT id, name FROM want_cards WHERE name_key IS NULL",
  );
  for (const row of unkeyed.rows) {
    await client.execute({
      sql: "UPDATE want_cards SET name_key = ? WHERE id = ?",
      args: [primaryKey(String(row.name)), Number(row.id)],
    });
  }
}

export const DEFAULT_LIST_NAME = "Want list";

export function getDb(): Promise<Client> {
  const cached = globalForDb.__tcgDb;
  if (cached?.schema === SCHEMA_FINGERPRINT) return cached.client;

  const client: Promise<Client> = initClient().catch((error) => {
    // A failed connection must not stay cached, or every later request gets
    // the same rejection handed back until the process is restarted.
    if (globalForDb.__tcgDb?.client === client) delete globalForDb.__tcgDb;
    throw error;
  });

  globalForDb.__tcgDb = { schema: SCHEMA_FINGERPRINT, client };
  return client;
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
  await db.execute({ sql: "DELETE FROM want_lists WHERE owner_id = ?", args: [ownerId] });
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
  /** 1 when the line was marked "!", 0 otherwise. */
  priority: number;
  /** Printing the wanter named, when their list was specific about one. */
  setCode: string | null;
  collectorNumber: string | null;
}

export interface WantList {
  id: string;
  ownerId: string;
  name: string;
  updatedAt: string;
  cards: WantCard[];
}

/** Every want list a person has, each with its cards. */
export async function listWantLists(ownerId: string): Promise<WantList[]> {
  const db = await getDb();

  const [lists, cards] = await Promise.all([
    db.execute({
      sql: "SELECT id, owner_id, name, updated_at FROM want_lists WHERE owner_id = ? ORDER BY name COLLATE NOCASE",
      args: [ownerId],
    }),
    db.execute({
      sql: `SELECT id, list_id, name, quantity, priority, set_code, collector_number
            FROM want_cards WHERE owner_id = ?
            ORDER BY priority DESC, name COLLATE NOCASE`,
      args: [ownerId],
    }),
  ]);

  const byList = new Map<string, WantCard[]>();
  for (const row of cards.rows) {
    const listId = String(row.list_id);
    const bucket = byList.get(listId) ?? [];
    bucket.push({
      id: Number(row.id),
      name: String(row.name),
      quantity: Number(row.quantity),
      priority: Number(row.priority),
      setCode: row.set_code ? String(row.set_code) : null,
      collectorNumber: row.collector_number ? String(row.collector_number) : null,
    });
    byList.set(listId, bucket);
  }

  return lists.rows.map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    updatedAt: String(row.updated_at),
    cards: byList.get(String(row.id)) ?? [],
  }));
}

export async function getWantList(listId: string): Promise<WantList | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT owner_id FROM want_lists WHERE id = ?",
    args: [listId],
  });
  if (result.rows.length === 0) return null;

  const lists = await listWantLists(String(result.rows[0].owner_id));
  return lists.find((list) => list.id === listId) ?? null;
}

export async function createWantList(ownerId: string, name: string): Promise<WantList> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const updatedAt = new Date().toISOString();

  await db.execute({
    sql: "INSERT INTO want_lists (id, owner_id, name, updated_at) VALUES (?, ?, ?, ?)",
    args: [id, ownerId, name.trim() || DEFAULT_LIST_NAME, updatedAt],
  });

  return { id, ownerId, name: name.trim() || DEFAULT_LIST_NAME, updatedAt, cards: [] };
}

export async function renameWantList(listId: string, name: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE want_lists SET name = ?, updated_at = ? WHERE id = ?",
    args: [name.trim() || DEFAULT_LIST_NAME, new Date().toISOString(), listId],
  });
}

export async function deleteWantList(listId: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `DELETE FROM want_keys WHERE want_id IN
            (SELECT id FROM want_cards WHERE list_id = ?)`,
    args: [listId],
  });
  await db.execute({ sql: "DELETE FROM want_cards WHERE list_id = ?", args: [listId] });
  await db.execute({ sql: "DELETE FROM want_lists WHERE id = ?", args: [listId] });
}

/** What a caller can ask to be put on a list. */
export interface WantInput {
  name: string;
  quantity: number;
  priority?: number;
  setCode?: string | null;
  collectorNumber?: string | null;
}

async function touchList(listId: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE want_lists SET updated_at = ? WHERE id = ?",
    args: [new Date().toISOString(), listId],
  });
}

async function insertWants(
  ownerId: string,
  listId: string,
  wants: WantInput[],
): Promise<void> {
  if (wants.length === 0) return;
  const db = await getDb();

  const CHUNK = 200;
  for (let i = 0; i < wants.length; i += CHUNK) {
    const chunk = wants.slice(i, i + CHUNK);
    const inserted = await db.execute({
      sql: `INSERT INTO want_cards
              (owner_id, list_id, name, name_key, quantity, priority, set_code, collector_number)
            VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
            RETURNING id, name`,
      args: chunk.flatMap((want) => [
        ownerId,
        listId,
        want.name,
        primaryKey(want.name),
        want.quantity,
        want.priority ?? 0,
        want.setCode ?? null,
        want.collectorNumber ?? null,
      ]),
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
}

/** Replace one list's contents wholesale; an empty list simply clears it. */
export async function replaceWantList(
  listId: string,
  wants: WantInput[],
): Promise<WantList | null> {
  const db = await getDb();
  const list = await getWantList(listId);
  if (!list) return null;

  await db.execute({
    sql: `DELETE FROM want_keys WHERE want_id IN
            (SELECT id FROM want_cards WHERE list_id = ?)`,
    args: [listId],
  });
  await db.execute({ sql: "DELETE FROM want_cards WHERE list_id = ?", args: [listId] });

  await insertWants(list.ownerId, listId, wants);
  await touchList(listId);
  return getWantList(listId);
}

/**
 * Merge wants into a list, which is what "add these to my want list" means:
 * a card already on the list keeps the larger of the two asks rather than
 * appearing twice or having the counts added together.
 */
export async function addToWantList(
  listId: string,
  wants: WantInput[],
): Promise<{ list: WantList; added: number; updated: number } | null> {
  const db = await getDb();
  const list = await getWantList(listId);
  if (!list) return null;

  const existing = await db.execute({
    sql: "SELECT id, name_key, quantity, priority FROM want_cards WHERE list_id = ?",
    args: [listId],
  });
  const byKey = new Map(
    existing.rows.map((row) => [
      String(row.name_key),
      { id: Number(row.id), quantity: Number(row.quantity), priority: Number(row.priority) },
    ]),
  );

  const fresh: WantInput[] = [];
  let updated = 0;

  for (const want of wants) {
    const key = primaryKey(want.name);
    const current = byKey.get(key);
    if (!current) {
      fresh.push(want);
      // Guards against the same card appearing twice in one paste.
      byKey.set(key, { id: -1, quantity: want.quantity, priority: want.priority ?? 0 });
      continue;
    }
    if (current.id < 0) continue;

    const quantity = Math.max(current.quantity, want.quantity);
    const priority = Math.max(current.priority, want.priority ?? 0);
    if (quantity === current.quantity && priority === current.priority) continue;

    await db.execute({
      sql: "UPDATE want_cards SET quantity = ?, priority = ? WHERE id = ?",
      args: [quantity, priority, current.id],
    });
    updated++;
  }

  await insertWants(list.ownerId, listId, fresh);
  await touchList(listId);

  const refreshed = await getWantList(listId);
  return refreshed ? { list: refreshed, added: fresh.length, updated } : null;
}

/** How many distinct cards each person wants, across all of their lists. */
export async function wantCounts(): Promise<Map<string, number>> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT owner_id, COUNT(DISTINCT name_key) AS n FROM want_cards GROUP BY owner_id",
  );
  return new Map(result.rows.map((row) => [String(row.owner_id), Number(row.n)]));
}

export interface WantMatch {
  wanterId: string;
  /** The folded card name — one person's wants collapse on this. */
  wantKey: string;
  wantName: string;
  wantQuantity: number;
  wantPriority: number;
  /** Printing the wanter named, when their list was specific about one. */
  wantSetCode: string | null;
  wantCollectorNumber: string | null;
  /** Which of the wanter's lists this want came from. */
  listName: string;
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
 * the database can pair them up directly. The same card can sit on several of
 * one person's lists, so callers must collapse on `wantKey` rather than
 * treating each row as a separate ask.
 */
export async function findWantMatches(): Promise<WantMatch[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT DISTINCT
       w.owner_id AS wanter_id, w.name_key AS want_key, w.name AS want_name,
       w.quantity AS want_quantity, w.priority AS want_priority,
       w.set_code AS want_set_code, w.collector_number AS want_collector_number,
       l.name AS list_name,
       c.id AS card_id, c.owner_id AS holder_id, o.name AS holder_name,
       c.name AS card_name, c.set_code, c.collector_number, c.quantity,
       c.tradelist_quantity, c.finish, c.condition, c.scryfall_id
     FROM want_keys wk
     JOIN want_cards w ON w.id = wk.want_id
     JOIN want_lists l ON l.id = w.list_id
     JOIN card_keys ck ON ck.name_key = wk.name_key
     JOIN collection_cards c ON c.id = ck.card_id
     JOIN owners o ON o.id = c.owner_id
     WHERE c.owner_id != w.owner_id`,
  );

  return result.rows.map((row) => ({
    wanterId: String(row.wanter_id),
    wantKey: String(row.want_key),
    wantName: String(row.want_name),
    wantQuantity: Number(row.want_quantity),
    wantPriority: Number(row.want_priority),
    wantSetCode: row.want_set_code ? String(row.want_set_code) : null,
    wantCollectorNumber: row.want_collector_number ? String(row.want_collector_number) : null,
    listName: String(row.list_name),
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
