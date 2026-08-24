import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SORT,
  countFor,
  defaultDescending,
  ownerIdOf,
  ownerSortKey,
  priceOf,
  sortRows,
  toggleSort,
} from "../src/lib/resultSort.ts";
import type { OwnerMatch, SearchRow } from "../src/lib/search.ts";

function owner(ownerId: string, quantity: number, tradeable = quantity): OwnerMatch {
  return {
    ownerId,
    ownerName: ownerId,
    totalQuantity: quantity,
    totalTradeable: tradeable,
    bestPrice: null,
    copies: [],
  };
}

function row(overrides: Partial<SearchRow> & { query: string }): SearchRow {
  const owners = overrides.owners ?? [];
  return {
    quantityWanted: 1,
    wantedSetCode: null,
    wantedCollectorNumber: null,
    priority: 0,
    quantityOwned: 0,
    quantityMissing: 1,
    resolvedName: null,
    imageUri: null,
    scryfallUri: null,
    tcgplayerUri: null,
    referencePrice: null,
    foundPriceLow: null,
    foundPriceHigh: null,
    totalAvailable: owners.reduce((sum, entry) => sum + entry.totalQuantity, 0),
    totalTradeable: owners.reduce((sum, entry) => sum + entry.totalTradeable, 0),
    ...overrides,
    owners,
  };
}

const names = (rows: SearchRow[]) => rows.map((entry) => entry.resolvedName ?? entry.query);

test("no column chosen leaves the server's order alone", () => {
  const rows = [row({ query: "Zubera" }), row({ query: "Ancestral" })];
  assert.deepEqual(sortRows(rows, DEFAULT_SORT, false), rows);
});

test("name sorts on what the table actually shows", () => {
  // The typed line and the resolved card can disagree; the resolved name wins
  // because that is the word the reader is scanning for.
  const rows = [
    row({ query: "bolt", resolvedName: "Lightning Bolt" }),
    row({ query: "Zubera" }),
    row({ query: "sol ring", resolvedName: "Ancestral Recall" }),
  ];

  assert.deepEqual(names(sortRows(rows, { key: "name", descending: false }, false)), [
    "Ancestral Recall",
    "Lightning Bolt",
    "Zubera",
  ]);
  assert.deepEqual(names(sortRows(rows, { key: "name", descending: true }, false)), [
    "Zubera",
    "Lightning Bolt",
    "Ancestral Recall",
  ]);
});

test("price sorts on the copies found, falling back to the reference", () => {
  const rows = [
    row({ query: "Cheap", foundPriceLow: 1, foundPriceHigh: 3 }),
    row({ query: "Reference", referencePrice: 10 }),
    row({ query: "Dear", foundPriceLow: 40, foundPriceHigh: 40 }),
  ];

  assert.deepEqual(names(sortRows(rows, { key: "price", descending: true }, false)), [
    "Dear",
    "Reference",
    "Cheap",
  ]);
  assert.deepEqual(names(sortRows(rows, { key: "price", descending: false }, false)), [
    "Cheap",
    "Reference",
    "Dear",
  ]);
});

/**
 * A card with no price at all is not the cheapest card on the list, it is a
 * card the price column has nothing to say about.
 */
test("cards with no price sink whichever way the column runs", () => {
  const rows = [
    row({ query: "Unpriced" }),
    row({ query: "Cheap", foundPriceLow: 1 }),
    row({ query: "Dear", foundPriceLow: 40 }),
  ];

  assert.equal(names(sortRows(rows, { key: "price", descending: true }, false)).at(-1), "Unpriced");
  assert.equal(names(sortRows(rows, { key: "price", descending: false }, false)).at(-1), "Unpriced");
});

test("an owner column sorts by that owner's count, under the current filter", () => {
  const rows = [
    row({ query: "One", owners: [owner("ana", 1, 1)] }),
    row({ query: "Four", owners: [owner("ana", 4, 0), owner("bo", 9, 9)] }),
    row({ query: "None", owners: [owner("bo", 2, 2)] }),
  ];

  const key = ownerSortKey("ana");
  assert.deepEqual(names(sortRows(rows, { key, descending: true }, false)), [
    "Four",
    "One",
    "None",
  ]);
  // Ana has four, but none of them for trade — so under that filter she has
  // fewer than the person holding one tradeable copy.
  assert.deepEqual(names(sortRows(rows, { key, descending: true }, true)), [
    "One",
    "Four",
    "None",
  ]);
});

test("ties break on the name, so a flip does not shuffle the rows underneath", () => {
  const rows = [
    row({ query: "Cabal Coffers" }),
    row({ query: "Ancient Tomb" }),
    row({ query: "Bazaar" }),
  ];

  const key = ownerSortKey("nobody");
  assert.deepEqual(names(sortRows(rows, { key, descending: true }, false)), [
    "Ancient Tomb",
    "Bazaar",
    "Cabal Coffers",
  ]);
  assert.deepEqual(names(sortRows(rows, { key, descending: false }, false)), [
    "Ancient Tomb",
    "Bazaar",
    "Cabal Coffers",
  ]);
});

test("sorting copies rather than reordering what it was handed", () => {
  const rows = [row({ query: "B" }), row({ query: "A" })];
  const sorted = sortRows(rows, { key: "name", descending: false }, false);
  assert.deepEqual(names(rows), ["B", "A"]);
  assert.notEqual(sorted, rows);
});

test("names run from A, money and counts from the top", () => {
  assert.equal(defaultDescending("name"), false);
  assert.equal(defaultDescending("default"), false);
  assert.equal(defaultDescending("price"), true);
  assert.equal(defaultDescending(ownerSortKey("ana")), true);
});

test("clicking a column picks it up, clicking it again turns it round", () => {
  const first = toggleSort(DEFAULT_SORT, "price");
  assert.deepEqual(first, { key: "price", descending: true });
  assert.deepEqual(toggleSort(first, "price"), { key: "price", descending: false });
  // A different column starts from its own default rather than inheriting.
  assert.deepEqual(toggleSort(first, "name"), { key: "name", descending: false });
});

test("owner keys survive the round trip through a select value", () => {
  const id = "9f3c-owner:with:colons";
  assert.equal(ownerIdOf(ownerSortKey(id)), id);
  assert.equal(ownerIdOf("price"), null);
  assert.equal(ownerIdOf("default"), null);
});

test("the counts and prices the columns read", () => {
  const entry = row({
    query: "Sol Ring",
    owners: [owner("ana", 3, 1)],
    foundPriceLow: 2,
    referencePrice: 99,
  });

  assert.equal(countFor(entry, "ana", false), 3);
  assert.equal(countFor(entry, "ana", true), 1);
  assert.equal(countFor(entry, "nobody", false), 0);
  assert.equal(priceOf(entry), 2);
  assert.equal(priceOf(row({ query: "x", referencePrice: 99 })), 99);
  assert.equal(priceOf(row({ query: "x" })), null);
});
