import { test, before } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { parseQuery } from "../src/lib/cardQuery.ts";
import { compileQuery, SORTS } from "../src/lib/cardQuerySql.ts";

/**
 * The compiler is tested by running what it produces.
 *
 * Asserting on SQL strings would pass for any query that happens to be spelled
 * the way the compiler spells it today, including one that means the wrong
 * thing. These queries run against a real SQLite database holding cards chosen
 * to disagree with each other — a land that is two colours while being none, a
 * foil worth ten times its ordinary printing, a row nobody has identified —
 * and assert on which cards come back.
 */
const db = new DatabaseSync(":memory:");

before(() => {
  db.exec(`
    CREATE TABLE collection_cards (
      id INTEGER PRIMARY KEY, owner_id TEXT, name TEXT, set_code TEXT,
      collector_number TEXT, quantity INTEGER, tradelist_quantity INTEGER,
      finish TEXT, condition TEXT, scryfall_id TEXT, facts_id TEXT
    );
    CREATE TABLE card_facts (
      scryfall_id TEXT PRIMARY KEY, name TEXT, set_code TEXT, set_name TEXT,
      released_at TEXT, rarity TEXT, mana_cost TEXT, cmc REAL, colors TEXT,
      color_identity TEXT, type_line TEXT, oracle_text TEXT, power TEXT,
      toughness TEXT, loyalty TEXT, keywords TEXT, legalities TEXT,
      artist TEXT, reserved INTEGER DEFAULT 0, promo INTEGER DEFAULT 0,
      usd REAL, usd_foil REAL, usd_etched REAL
    );
  `);

  /**
   * Keyed by name rather than positionally, because the two tables have to
   * agree and an index that quietly slips by one produces a collection whose
   * cards are all the wrong cards.
   */
  interface Seed {
    set: string;
    quantity: number;
    tradelist: number;
    finish: string;
    condition: string;
    /** Absent for a row nothing has identified yet. */
    facts?: {
      rarity: string;
      cmc: number;
      colors: string;
      identity: string;
      type: string;
      oracle: string;
      power?: string;
      toughness?: string;
      keywords?: string[];
      commander?: string;
      usd: number | null;
      usdFoil: number | null;
      reserved?: boolean;
    };
  }

  const SEEDS: Record<string, Seed> = {
    "Lightning Bolt": {
      set: "lea", quantity: 4, tradelist: 2, finish: "normal", condition: "NM",
      facts: { rarity: "common", cmc: 1, colors: "R", identity: "R", type: "Instant",
        oracle: "deals 3 damage", usd: 2, usdFoil: 30, reserved: true },
    },
    "Counterspell": {
      set: "lea", quantity: 2, tradelist: 0, finish: "normal", condition: "LP",
      facts: { rarity: "uncommon", cmc: 2, colors: "U", identity: "U", type: "Instant",
        oracle: "Counter target spell.", usd: 1, usdFoil: 40 },
    },
    "Sol Ring": {
      set: "c21", quantity: 1, tradelist: 1, finish: "foil", condition: "NM",
      facts: { rarity: "uncommon", cmc: 1, colors: "", identity: "", type: "Artifact",
        oracle: "Add two colorless mana.", usd: 1.5, usdFoil: 20 },
    },
    "Breeding Pool": {
      set: "rna", quantity: 1, tradelist: 0, finish: "normal", condition: "NM",
      facts: { rarity: "rare", cmc: 0, colors: "", identity: "UG",
        type: "Land — Forest Island", oracle: "enters tapped", usd: 12, usdFoil: 25 },
    },
    "Teferi, Hero of Dominaria": {
      set: "dom", quantity: 1, tradelist: 0, finish: "normal", condition: "NM",
      facts: { rarity: "mythic", cmc: 5, colors: "WU", identity: "WU",
        type: "Legendary Planeswalker — Teferi", oracle: "Draw a card.", usd: 8, usdFoil: 16 },
    },
    "Abhorrent Oculus": {
      set: "dsk", quantity: 3, tradelist: 3, finish: "normal", condition: "NM",
      facts: { rarity: "rare", cmc: 3, colors: "U", identity: "U", type: "Creature — Eye",
        oracle: "Flying", power: "5", toughness: "5", keywords: ["Flying"], usd: 13, usdFoil: 26 },
    },
    "Serra Angel": {
      set: "lea", quantity: 1, tradelist: 0, finish: "normal", condition: "NM",
      facts: { rarity: "uncommon", cmc: 5, colors: "W", identity: "W", type: "Creature — Angel",
        oracle: "Flying, vigilance", power: "4", toughness: "4",
        keywords: ["Flying", "Vigilance"], usd: 3, usdFoil: 9 },
    },
    // Uploaded but never identified — every facts column is null for this row.
    "Mystery Card": {
      set: "xyz", quantity: 1, tradelist: 0, finish: "normal", condition: "NM",
    },
    "Ach! Hans, Run!": {
      set: "unh", quantity: 1, tradelist: 0, finish: "normal", condition: "NM",
      facts: { rarity: "rare", cmc: 8, colors: "RG", identity: "RG", type: "Enchantment",
        oracle: "It's a bear!", commander: "not_legal", usd: 40, usdFoil: null },
    },
  };

  const insertCard = db.prepare(
    `INSERT INTO collection_cards
       (id, owner_id, name, set_code, collector_number, quantity,
        tradelist_quantity, finish, condition, scryfall_id, facts_id)
     VALUES (?, 'me', ?, ?, '1', ?, ?, ?, ?, ?, ?)`,
  );
  const insertFacts = db.prepare(
    `INSERT INTO card_facts
       (scryfall_id, name, set_code, set_name, released_at, rarity, cmc, colors,
        color_identity, type_line, oracle_text, power, toughness, keywords,
        legalities, artist, reserved, usd, usd_foil)
     VALUES (?, ?, ?, 'Some Set', '2019-01-25', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'An Artist', ?, ?, ?)`,
  );

  Object.entries(SEEDS).forEach(([name, seed], index) => {
    const id = seed.facts ? `sf-${index}` : null;
    insertCard.run(
      index + 1, name, seed.set, seed.quantity, seed.tradelist,
      seed.finish, seed.condition, id, id,
    );

    if (!seed.facts || !id) return;
    const f = seed.facts;
    insertFacts.run(
      id, name, seed.set, f.rarity, f.cmc, f.colors, f.identity, f.type, f.oracle,
      f.power ?? null, f.toughness ?? null, JSON.stringify(f.keywords ?? []),
      JSON.stringify({ commander: f.commander ?? "legal", vintage: "restricted" }),
      f.reserved ? 1 : 0, f.usd, f.usdFoil,
    );
  });
});

/** The names a query selects, sorted so assertions read as sets. */
function matching(query: string): string[] {
  const { node } = parseQuery(query);
  const compiled = node ? compileQuery(node) : { sql: "1", args: [] };

  const rows = db
    .prepare(
      `SELECT c.name FROM collection_cards c
       LEFT JOIN card_facts f ON f.scryfall_id = c.facts_id
       WHERE c.owner_id = 'me' AND ${compiled.sql}
       ORDER BY c.name`,
    )
    .all(...compiled.args) as Array<{ name: string }>;

  return rows.map((row) => row.name);
}

test("a bare word matches the collection row's own name", () => {
  assert.deepEqual(matching("bolt"), ["Lightning Bolt"]);
});

/** The property that makes an un-enriched collection usable at all. */
test("name search reaches rows nothing has identified", () => {
  assert.deepEqual(matching("mystery"), ["Mystery Card"]);
});

test("at-least-this-colour includes cards of more colours", () => {
  assert.deepEqual(matching("c:u"), [
    "Abhorrent Oculus",
    "Counterspell",
    "Teferi, Hero of Dominaria",
  ]);
});

test("exactly-this-colour excludes the multicoloured", () => {
  assert.deepEqual(matching("c=u"), ["Abhorrent Oculus", "Counterspell"]);
});

/**
 * The Commander question. Breeding Pool is colourless and still does not fit
 * an Azorius deck, which is exactly why identity is a separate column.
 */
test("colour identity at most these colours is not the same as colours", () => {
  assert.deepEqual(matching("id<=wu"), [
    "Abhorrent Oculus",
    "Counterspell",
    "Serra Angel",
    "Sol Ring",
    "Teferi, Hero of Dominaria",
  ]);
  assert.ok(!matching("id<=wu").includes("Breeding Pool"));
  assert.deepEqual(matching("c<=wu"), [
    "Abhorrent Oculus",
    "Breeding Pool",
    "Counterspell",
    "Serra Angel",
    "Sol Ring",
    "Teferi, Hero of Dominaria",
  ]);
});

test("multicolour means two or more, not one or more", () => {
  assert.deepEqual(matching("c:m"), ["Ach! Hans, Run!", "Teferi, Hero of Dominaria"]);
});

test("colourless is its own answer, and lands still count as it", () => {
  assert.deepEqual(matching("c:c"), ["Breeding Pool", "Sol Ring"]);
});

test("guild names filter as their colours do", () => {
  assert.deepEqual(matching("c:azorius"), ["Teferi, Hero of Dominaria"]);
});

test("types, ranges and rarities filter as written", () => {
  assert.deepEqual(matching("t:instant"), ["Counterspell", "Lightning Bolt"]);
  assert.deepEqual(matching("mv<=1"), ["Breeding Pool", "Lightning Bolt", "Sol Ring"]);
  assert.deepEqual(matching("r>=rare"), [
    "Abhorrent Oculus",
    "Ach! Hans, Run!",
    "Breeding Pool",
    "Teferi, Hero of Dominaria",
  ]);
  assert.deepEqual(matching("pow>=5"), ["Abhorrent Oculus"]);
});

test("oracle text and keywords are searchable, keywords exactly", () => {
  assert.deepEqual(matching('o:"counter target"'), ["Counterspell"]);
  assert.deepEqual(matching("kw:flying"), ["Abhorrent Oculus", "Serra Angel"]);
  assert.deepEqual(matching("kw:vigilance"), ["Serra Angel"]);
  // "Fly" must not match the keyword "Flying" — keywords are whole words.
  assert.deepEqual(matching("kw:fly"), []);
});

/**
 * A foil Sol Ring is a $20 card sitting in a row whose plain price is $1.50.
 * Filtering on the wrong one of those is how a value filter loses the
 * expensive cards it exists to find.
 */
test("price filters use the finish this person actually owns", () => {
  assert.ok(matching("usd>10").includes("Sol Ring"), "the foil is worth more than $10");
  assert.ok(!matching("usd<2").includes("Sol Ring"), "and so is not under $2");
  assert.ok(matching("usd<2").includes("Counterspell"), "the non-foil is priced plainly");
});

test("collection properties filter alongside card ones", () => {
  assert.deepEqual(matching("is:foil"), ["Sol Ring"]);
  assert.deepEqual(matching("is:tradeable"), ["Abhorrent Oculus", "Lightning Bolt", "Sol Ring"]);
  assert.deepEqual(matching("is:unidentified"), ["Mystery Card"]);
  assert.deepEqual(matching("is:reserved"), ["Lightning Bolt"]);
  assert.deepEqual(matching("qty>=3"), ["Abhorrent Oculus", "Lightning Bolt"]);
  assert.deepEqual(matching("cond:LP"), ["Counterspell"]);
});

test("set codes fall back to the row's own, so they work un-enriched", () => {
  assert.deepEqual(matching("s:xyz"), ["Mystery Card"]);
  assert.deepEqual(matching("e:lea"), ["Counterspell", "Lightning Bolt", "Serra Angel"]);
});

test("format legality reads the stored legalities, restricted included", () => {
  assert.ok(!matching("f:commander").includes("Ach! Hans, Run!"));
  assert.ok(matching("f:commander").includes("Counterspell"));
  assert.ok(matching("f:vintage").includes("Ach! Hans, Run!"), "restricted still counts");
});

test("and, or and brackets combine as written", () => {
  assert.deepEqual(matching("t:creature c:u"), ["Abhorrent Oculus"]);
  assert.deepEqual(matching("kw:vigilance or t:instant"), [
    "Counterspell",
    "Lightning Bolt",
    "Serra Angel",
  ]);
  assert.deepEqual(matching("t:creature (c:u or c:w)"), ["Abhorrent Oculus", "Serra Angel"]);
});

/**
 * The subtle one. `NOT NULL` is NULL in SQL, so a naive negation drops every
 * unidentified row out of both a filter and its opposite — cards vanish from
 * the screen with nothing to explain it. They belong under the negative:
 * "is this a creature?" answered by "we do not know" is not a yes.
 */
test("negation keeps rows nothing has identified yet", () => {
  const notCreature = matching("-t:creature");

  assert.ok(notCreature.includes("Mystery Card"), "an unknown card is not known to be a creature");
  assert.ok(!notCreature.includes("Serra Angel"));
  assert.ok(notCreature.includes("Lightning Bolt"));
});

test("negation composes with everything else", () => {
  assert.deepEqual(matching("t:instant -c:r"), ["Counterspell"]);
  assert.deepEqual(matching("-is:tradeable t:creature"), ["Serra Angel"]);
});

/**
 * `Ach! Hans, Run!` is a real card, and `_` is a real SQL wildcard. A name
 * search that forgets to escape one turns into a search for anything.
 */
test("wildcards in a search term are matched literally", () => {
  assert.deepEqual(matching("n:Ach!"), ["Ach! Hans, Run!"]);
  assert.deepEqual(matching("n:so_"), [], "an underscore is a character, not a wildcard");
  assert.deepEqual(matching("n:sol"), ["Sol Ring"]);
  assert.deepEqual(matching("n:%"), [], "a percent sign matches nothing, not everything");
});

test("every sort is valid SQL over the same join", () => {
  for (const [name, order] of Object.entries(SORTS)) {
    const rows = db
      .prepare(
        `SELECT c.name FROM collection_cards c
         LEFT JOIN card_facts f ON f.scryfall_id = c.facts_id
         WHERE c.owner_id = 'me' ORDER BY ${order}`,
      )
      .all() as Array<{ name: string }>;

    assert.equal(rows.length, 9, `sort "${name}" lost or duplicated rows`);
  }
});

test("sorting by price puts the most valuable copy first", () => {
  const rows = db
    .prepare(
      `SELECT c.name FROM collection_cards c
       LEFT JOIN card_facts f ON f.scryfall_id = c.facts_id
       WHERE c.owner_id = 'me' ORDER BY ${SORTS.price}`,
    )
    .all() as Array<{ name: string }>;

  assert.equal(rows[0].name, "Ach! Hans, Run!", "$40");
  // The foil Sol Ring at $20 outranks the $13 Oculus despite a $1.50 face.
  assert.ok(
    rows.findIndex((r) => r.name === "Sol Ring") <
      rows.findIndex((r) => r.name === "Abhorrent Oculus"),
  );
  assert.equal(rows[rows.length - 1].name, "Mystery Card", "unpriced sorts last");
});
