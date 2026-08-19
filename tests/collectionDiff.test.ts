import { test } from "node:test";
import assert from "node:assert/strict";

import {
  describeDiff,
  diffCollections,
  type CountedCard,
} from "../src/lib/collectionDiff.ts";

function card(name: string, quantity = 1, tradelistQuantity = 0): CountedCard {
  return { name, quantity, tradelistQuantity };
}

test("a first upload has nothing to compare against", () => {
  const diff = diffCollections(null, [card("Sol Ring")]);
  assert.equal(diff.firstUpload, true);
  assert.equal(diff.addedCards, 0);
  assert.equal(describeDiff(diff), null);
});

test("an unchanged collection says so rather than nothing", () => {
  const before = [card("Sol Ring", 2, 1)];
  const diff = diffCollections(before, [card("Sol Ring", 2, 1)]);
  assert.equal(diff.addedCards, 0);
  assert.equal(diff.removedCards, 0);
  assert.equal(describeDiff(diff), "nothing has changed since last time");
});

test("new cards are counted and named", () => {
  const diff = diffCollections(
    [card("Sol Ring")],
    [card("Sol Ring"), card("Rhystic Study"), card("Smothering Tithe")],
  );
  assert.equal(diff.addedCards, 2);
  assert.equal(diff.copiesAdded, 2);
  assert.deepEqual(diff.examples, ["Rhystic Study", "Smothering Tithe"]);
  assert.equal(describeDiff(diff), "2 new cards");
});

test("cards that have gone are counted", () => {
  const diff = diffCollections([card("Sol Ring"), card("Rhystic Study")], [card("Sol Ring")]);
  assert.equal(diff.removedCards, 1);
  assert.equal(diff.copiesRemoved, 1);
  assert.equal(describeDiff(diff), "1 gone");
});

test("extra copies of a card already held are copies, not new cards", () => {
  const diff = diffCollections([card("Sol Ring", 1)], [card("Sol Ring", 4)]);
  assert.equal(diff.addedCards, 0);
  assert.equal(diff.copiesAdded, 3);
  assert.equal(describeDiff(diff), "3 more copies");
});

test("copy-level changes stay quiet when whole cards moved", () => {
  // Otherwise every summary turns into a list of four numbers.
  const diff = diffCollections(
    [card("Sol Ring", 1)],
    [card("Sol Ring", 4), card("Rhystic Study")],
  );
  assert.equal(diff.copiesAdded, 4);
  assert.equal(describeDiff(diff), "1 new card");
});

test("newly tradeable copies are worth saying on their own", () => {
  // Nothing was bought or sold; a card was just moved into the trade binder,
  // which is exactly the change a trade partner needs to know about.
  const diff = diffCollections([card("Sol Ring", 2, 0)], [card("Sol Ring", 2, 1)]);
  assert.equal(diff.newlyTradeable, 1);
  assert.equal(describeDiff(diff), "1 newly up for trade");
});

test("a new card that arrives tradeable counts as newly tradeable", () => {
  const diff = diffCollections([], [card("Sol Ring", 1, 1)]);
  assert.equal(diff.addedCards, 1);
  assert.equal(diff.newlyTradeable, 1);
  assert.equal(describeDiff(diff), "1 new card, 1 newly up for trade");
});

test("a card losing tradeable copies is not reported as newly tradeable", () => {
  const diff = diffCollections([card("Sol Ring", 2, 2)], [card("Sol Ring", 2, 0)]);
  assert.equal(diff.newlyTradeable, 0);
  assert.equal(describeDiff(diff), "nothing has changed since last time");
});

test("printings of one card are summed, not counted separately", () => {
  // Two rows for the same card is the normal shape of an export.
  const diff = diffCollections(
    [card("Sol Ring", 1), card("Sol Ring", 1)],
    [card("Sol Ring", 3)],
  );
  assert.equal(diff.addedCards, 0);
  assert.equal(diff.copiesAdded, 1);
});

test("names are compared case- and space-insensitively", () => {
  const diff = diffCollections([card("Sol Ring")], [card("  sol ring  ")]);
  assert.equal(diff.addedCards, 0);
  assert.equal(diff.removedCards, 0);
});

test("a custom key decides what counts as the same card", () => {
  // The app folds split and double-faced names, so "Fire // Ice" and "Fire"
  // must not read as one card arriving and another leaving.
  const diff = diffCollections(
    [card("Fire // Ice")],
    [card("Fire")],
    (entry) => entry.name.split("//")[0].trim().toLowerCase(),
  );
  assert.equal(diff.addedCards, 0);
  assert.equal(diff.removedCards, 0);
});

test("a swap reports both directions", () => {
  const diff = diffCollections([card("Sol Ring", 2)], [card("Mana Crypt", 1)]);
  assert.equal(diff.addedCards, 1);
  assert.equal(diff.removedCards, 1);
  assert.equal(diff.copiesAdded, 1);
  assert.equal(diff.copiesRemoved, 2);
  assert.equal(describeDiff(diff), "1 new card, 1 gone");
});

test("only the first few new names are kept as examples", () => {
  const diff = diffCollections(
    [],
    ["Ancestral", "Balance", "Counterspell", "Demonic Tutor", "Emrakul"].map((n) => card(n)),
  );
  assert.equal(diff.addedCards, 5);
  assert.equal(diff.examples.length, 3);
});
