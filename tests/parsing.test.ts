import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeName, nameKeys } from "../src/lib/normalize.ts";
import { parseCollectionCsv, parseDelimited } from "../src/lib/csv.ts";
import { parseWantList } from "../src/lib/parseList.ts";

test("normalizeName folds accents, punctuation and case", () => {
  assert.equal(normalizeName("Lim-Dûl's Vault"), "limduls vault");
  assert.equal(normalizeName("lim duls vault"), "lim duls vault");
  assert.equal(normalizeName("Jhoira, Weatherlight Captain"), "jhoira weatherlight captain");
  assert.equal(normalizeName("Æther Vial"), "aether vial");
  assert.equal(normalizeName("  Sol   Ring "), "sol ring");
  assert.equal(normalizeName("Ratchet Bomb"), "ratchet bomb");
});

test("normalizeName is stable across apostrophe styles", () => {
  assert.equal(normalizeName("Urza’s Saga"), normalizeName("Urza's Saga"));
});

test("nameKeys indexes every face of a split card", () => {
  const keys = nameKeys("Brazen Borrower // Petty Theft");
  assert.ok(keys.includes("brazen borrower // petty theft"));
  assert.ok(keys.includes("brazen borrower"));
  assert.ok(keys.includes("petty theft"));
});

test("parseDelimited handles quoted fields and escaped quotes", () => {
  const rows = parseDelimited('a,b\n"Jhoira, Captain","say ""hi"""\n', ",");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["Jhoira, Captain", 'say "hi"'],
  ]);
});

test("parseCollectionCsv reads a Moxfield export", () => {
  const csv = [
    '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"',
    '"2","1","Sol Ring","c21","NM","English","","","2026-01-01","263","False","False","0.00"',
    '"1","0","Rhystic Study","j22","NM","English","foil","","2026-01-01","114","False","False","0.00"',
    '"4","4","Jhoira, Weatherlight Captain","dom","NM","English","","","2026-01-01","199","False","False","0.00"',
  ].join("\n");

  const { cards, skipped } = parseCollectionCsv(csv);
  assert.equal(skipped, 0);
  assert.equal(cards.length, 3);

  assert.deepEqual(cards[0], {
    name: "Sol Ring",
    setCode: "c21",
    collectorNumber: "263",
    quantity: 2,
    tradelistQuantity: 1,
    finish: "normal",
    condition: "NM",
    language: "English",
    scryfallId: null,
  });
  assert.equal(cards[1].finish, "foil");
  assert.equal(cards[2].name, "Jhoira, Weatherlight Captain");
});

test("parseCollectionCsv reads a ManaBox-style export with different headers", () => {
  const csv = [
    "Name,Set code,Collector number,Foil,Quantity,Scryfall ID",
    "Lightning Bolt,lea,161,normal,1,abc-123",
    "Mox Diamond,STH,290,etched,3,def-456",
  ].join("\n");

  const { cards } = parseCollectionCsv(csv);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].setCode, "lea");
  assert.equal(cards[0].scryfallId, "abc-123");
  // No tradelist column: everything counts as tradeable.
  assert.equal(cards[0].tradelistQuantity, 1);
  assert.equal(cards[1].setCode, "sth");
  assert.equal(cards[1].finish, "etched");
  assert.equal(cards[1].quantity, 3);
});

test("parseCollectionCsv rejects a file with no name column", () => {
  assert.throws(() => parseCollectionCsv("foo,bar\n1,2"), /No card-name column/);
});

test("parseWantList handles the formats people actually paste", () => {
  const list = [
    "// my deck",
    "Deck",
    "4x Lightning Bolt",
    "2 Sol Ring (C21) 263",
    "Rhystic Study",
    "Creatures (12)",
    "SB: 1 Pithing Needle",
    "1 Brazen Borrower *F*",
    "",
    "Jhoira, Weatherlight Captain",
  ].join("\n");

  const wanted = parseWantList(list);
  const byName = Object.fromEntries(wanted.map((w) => [w.name, w]));

  assert.equal(wanted.length, 6);
  assert.equal(byName["Lightning Bolt"].quantity, 4);
  assert.equal(byName["Sol Ring"].quantity, 2);
  assert.equal(byName["Sol Ring"].setCode, "c21");
  assert.equal(byName["Sol Ring"].collectorNumber, "263");
  assert.equal(byName["Rhystic Study"].quantity, 1);
  assert.equal(byName["Pithing Needle"].quantity, 1);
  assert.equal(byName["Brazen Borrower"].quantity, 1);
  assert.ok(byName["Jhoira, Weatherlight Captain"]);
});

test("parseWantList merges duplicate lines", () => {
  const wanted = parseWantList("2 Sol Ring\n3 Sol Ring");
  assert.equal(wanted.length, 1);
  assert.equal(wanted[0].quantity, 5);
});

test("parseWantList reads the priority marker", () => {
  const wants = parseWantList(["!Rhystic Study", "!2x Sol Ring", "Llanowar Elves"].join("\n"));
  const byName = new Map(wants.map((want) => [want.name, want]));

  assert.equal(byName.get("Rhystic Study")?.priority, 1);
  assert.equal(byName.get("Sol Ring")?.priority, 1);
  assert.equal(byName.get("Sol Ring")?.quantity, 2);
  assert.equal(byName.get("Llanowar Elves")?.priority, 0);
});

test("a card marked priority on any line stays a priority", () => {
  const [want] = parseWantList("Sol Ring\n!Sol Ring");
  assert.equal(want.quantity, 2);
  assert.equal(want.priority, 1);
});

test("a bare exclamation mark is not a card", () => {
  assert.deepEqual(parseWantList("!\n!  "), []);
});

test("the want-list editor's rendering round-trips back to the same want", () => {
  // WantLists renders saved wants as "!2x Name (SET) 123"; parsing that has to
  // give back what was stored or editing a list would quietly rewrite it.
  const [want] = parseWantList("!2x Dockside Extortionist (LCI) 106");
  assert.equal(want.name, "Dockside Extortionist");
  assert.equal(want.quantity, 2);
  assert.equal(want.priority, 1);
  assert.equal(want.setCode, "lci");
  assert.equal(want.collectorNumber, "106");
});

test("a Moxfield export is recognised as one", () => {
  const csv = [
    '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags",' +
      '"Last Modified","Collector Number","Alter","Proxy","Purchase Price"',
    '"1","1","Sol Ring","c21","NM","English","","","2026-08-01","263","False","False","0.00"',
  ].join("\n");
  assert.equal(parseCollectionCsv(csv).tracker, "moxfield");
});

test("Deckbox is not mistaken for Moxfield despite the shared columns", () => {
  // Both export Count, Tradelist Count and Edition; only Deckbox has a
  // Printing Id, and only Moxfield has Alter/Proxy.
  const csv = [
    '"Count","Tradelist Count","Name","Edition","Card Number","Condition","Language",' +
      '"Foil","Signed","Artist Proof","Altered Art","Misprint","Promo","Textless",' +
      '"Printing Id","Press Foil","My Price"',
    '"1","1","Sol Ring","Commander 2021","263","Near Mint","English","","","","","","","","1","",""',
  ].join("\n");
  assert.equal(parseCollectionCsv(csv).tracker, "deckbox");
});

test("an unrecognised export is left unattributed rather than guessed at", () => {
  // Wrong export instructions later are worse than none.
  const csv = 'Name,Quantity\nSol Ring,2';
  assert.equal(parseCollectionCsv(csv).tracker, null);
});

test("detection does not stop an unknown export from parsing", () => {
  const result = parseCollectionCsv('Name,Quantity\nSol Ring,2');
  assert.equal(result.tracker, null);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].quantity, 2);
});
