import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cardToWant,
  collectionToWants,
  type CollectableCard,
} from "../src/lib/wantDrafts.ts";

function card(name: string, setCode = "lea", collectorNumber = "1"): CollectableCard {
  return { name, setCode, collectorNumber };
}

test("an empty collection asks for nothing", () => {
  assert.deepEqual(collectionToWants([]), { wants: [], distinct: 0, omitted: 0 });
});

/**
 * The reason this exists. Four copies in three conditions across two sets is
 * six collection rows and one card somebody wants.
 */
test("every printing and copy of a card folds to one want", () => {
  const result = collectionToWants([
    card("Lightning Bolt", "lea", "161"),
    card("Lightning Bolt", "m10", "146"),
    card("Lightning Bolt", "lea", "161"),
    card("Counterspell"),
  ]);

  assert.equal(result.distinct, 2);
  assert.deepEqual(
    result.wants.map((want) => want.name),
    ["Lightning Bolt", "Counterspell"],
  );
});

test("names differing only in case are the same card", () => {
  const result = collectionToWants([card("Sol Ring"), card("sol ring"), card("SOL RING")]);

  assert.equal(result.distinct, 1);
  assert.equal(result.wants.length, 1);
});

test("a bulk want asks for one copy and names no printing", () => {
  const [want] = collectionToWants([card("Sol Ring", "c21", "263")]).wants;

  assert.equal(want.quantity, 1);
  assert.equal(want.setCode, undefined, "a bulk add is these cards, not these copies");
  assert.equal(want.collectorNumber, undefined);
});

/**
 * "Add everything" against an unfiltered collection has to stop somewhere, and
 * has to say that it did — a want list that silently holds a third of what was
 * asked for is worse than one that refused.
 */
test("past the cap it adds what it can and reports the rest", () => {
  const many = Array.from({ length: 25 }, (_, i) => card(`Card ${i}`));
  const result = collectionToWants(many, { limit: 10 });

  assert.equal(result.wants.length, 10);
  assert.equal(result.distinct, 25, "counting does not stop at the cap");
  assert.equal(result.omitted, 15);
});

test("nothing is omitted when everything fits", () => {
  const result = collectionToWants([card("Sol Ring"), card("Counterspell")], { limit: 10 });

  assert.equal(result.omitted, 0);
});

test("blank names are skipped rather than saved", () => {
  const result = collectionToWants([card("  "), card("Sol Ring"), card("")]);

  assert.equal(result.distinct, 1);
  assert.deepEqual(result.wants.map((w) => w.name), ["Sol Ring"]);
});

test("names are trimmed on the way in", () => {
  assert.equal(collectionToWants([card("  Sol Ring  ")]).wants[0].name, "Sol Ring");
});

/**
 * The other half of the rule: one card picked off a tile keeps the printing,
 * because the trades tab can only say "this is the version you asked for" when
 * a version was asked for.
 */
test("a single card keeps the printing it was picked from", () => {
  const want = cardToWant(card("Sol Ring", "c21", "263"));

  assert.deepEqual(want, {
    name: "Sol Ring",
    quantity: 1,
    setCode: "c21",
    collectorNumber: "263",
  });
});

test("a single card with no printing recorded still adds", () => {
  assert.deepEqual(cardToWant({ name: "Sol Ring", setCode: null, collectorNumber: null }), {
    name: "Sol Ring",
    quantity: 1,
    setCode: null,
    collectorNumber: null,
  });
});
