import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTradeCards } from "../src/lib/tradeMath.ts";

/** Minimal stand-in for a priced collection row. */
function copy(over: Partial<Parameters<typeof buildTradeCards>[0][0]["copies"][0]> = {}) {
  return {
    quantity: 1,
    tradelistQuantity: 1,
    price: 1,
    priceApproximate: false,
    setCode: "abc",
    collectorNumber: "1",
    finish: "normal",
    condition: "NM",
    ...over,
  };
}

test("a want is matched only up to the number of copies available", () => {
  const [card] = buildTradeCards(
    [{ name: "Sol Ring", quantityWanted: 4, copies: [copy({ quantity: 2, tradelistQuantity: 2 })] }],
    false,
  );
  assert.equal(card.quantityWanted, 4);
  assert.equal(card.quantityAvailable, 2);
  assert.equal(card.quantityMatched, 2);
});

test("a want is not over-matched when there are more copies than wanted", () => {
  const [card] = buildTradeCards(
    [{ name: "Sol Ring", quantityWanted: 1, copies: [copy({ quantity: 4, tradelistQuantity: 4 })] }],
    false,
  );
  assert.equal(card.quantityMatched, 1);
});

test("value counts the cheapest copies that would change hands", () => {
  // Wants 2; owner has a $10 and two $1 copies. A trade would move the $1s.
  const [card] = buildTradeCards(
    [
      {
        name: "Sol Ring",
        quantityWanted: 2,
        copies: [
          copy({ price: 10, quantity: 1, tradelistQuantity: 1 }),
          copy({ price: 1, quantity: 2, tradelistQuantity: 2 }),
        ],
      },
    ],
    false,
  );
  assert.equal(card.quantityMatched, 2);
  assert.equal(card.value, 2);
});

test("the tradeable filter limits what counts as available", () => {
  const groups = [
    {
      name: "Sol Ring",
      quantityWanted: 3,
      copies: [copy({ quantity: 3, tradelistQuantity: 1 })],
    },
  ];

  const [all] = buildTradeCards(groups, false);
  assert.equal(all.quantityAvailable, 3);
  assert.equal(all.quantityMatched, 3);

  const [tradeable] = buildTradeCards(groups, true);
  assert.equal(tradeable.quantityAvailable, 1);
  assert.equal(tradeable.quantityMatched, 1);
});

test("a card with nothing tradeable drops out entirely", () => {
  const cards = buildTradeCards(
    [{ name: "Sol Ring", quantityWanted: 2, copies: [copy({ quantity: 2, tradelistQuantity: 0 })] }],
    true,
  );
  assert.equal(cards.length, 0);
});

test("unpriced copies do not count as free", () => {
  const [card] = buildTradeCards(
    [
      {
        name: "Some Promo",
        quantityWanted: 2,
        copies: [
          copy({ price: null, quantity: 1, tradelistQuantity: 1 }),
          copy({ price: 5, quantity: 1, tradelistQuantity: 1 }),
        ],
      },
    ],
    false,
  );
  // Both copies move, but only the priced one contributes value.
  assert.equal(card.quantityMatched, 2);
  assert.equal(card.value, 5);
});

test("cards are ordered by value, most valuable first", () => {
  const cards = buildTradeCards(
    [
      { name: "Cheap", quantityWanted: 1, copies: [copy({ price: 1 })] },
      { name: "Pricey", quantityWanted: 1, copies: [copy({ price: 50 })] },
    ],
    false,
  );
  assert.deepEqual(
    cards.map((card) => card.name),
    ["Pricey", "Cheap"],
  );
});
