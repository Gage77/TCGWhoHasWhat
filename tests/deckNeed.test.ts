import { test } from "node:test";
import assert from "node:assert/strict";

import { deckNeed } from "../src/lib/deckNeed.ts";

const ME = "me";
const copies = [
  { ownerId: ME, quantity: 1 },
  { ownerId: "someone-else", quantity: 4 },
];

test("without a deck owner nothing is subtracted", () => {
  assert.deepEqual(deckNeed(4, null, copies), {
    quantityOwned: 0,
    quantityMissing: 4,
    satisfied: false,
  });
});

test("only the searcher's own copies are subtracted", () => {
  // The other person's 4 copies are where to get the card, not proof of ownership.
  assert.deepEqual(deckNeed(4, ME, copies), {
    quantityOwned: 1,
    quantityMissing: 3,
    satisfied: false,
  });
});

test("a line is satisfied when the searcher owns enough", () => {
  assert.deepEqual(deckNeed(1, ME, copies), {
    quantityOwned: 1,
    quantityMissing: 0,
    satisfied: true,
  });
});

test("owning more than the deck calls for does not go negative", () => {
  // A negative shortfall would subtract from the totals elsewhere.
  const need = deckNeed(2, ME, [{ ownerId: ME, quantity: 9 }]);
  assert.equal(need.quantityMissing, 0);
  assert.equal(need.satisfied, true);
});

test("copies spread across printings are added together", () => {
  const need = deckNeed(4, ME, [
    { ownerId: ME, quantity: 1 },
    { ownerId: ME, quantity: 2 },
  ]);
  assert.equal(need.quantityOwned, 3);
  assert.equal(need.quantityMissing, 1);
});

test("owning none leaves the whole line outstanding", () => {
  const need = deckNeed(3, ME, [{ ownerId: "other", quantity: 5 }]);
  assert.deepEqual(need, { quantityOwned: 0, quantityMissing: 3, satisfied: false });
});
