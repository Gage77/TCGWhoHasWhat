import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTradeCards, suggestEvenUp, type TradeCard } from "../src/lib/tradeMath.ts";

/** Minimal stand-in for a priced collection row. */
function copy(over: Partial<Parameters<typeof buildTradeCards>[0][0]["copies"][0]> = {}) {
  return {
    quantity: 1,
    tradelistQuantity: 1,
    price: 1,
    priceApproximate: false,
    imageUri: null,
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

test("unitValues lists the copies that were counted, cheapest first", () => {
  const [card] = buildTradeCards(
    [
      {
        name: "Sol Ring",
        quantityWanted: 2,
        copies: [
          copy({ price: 10, quantity: 1, tradelistQuantity: 1 }),
          copy({ price: 1, quantity: 1, tradelistQuantity: 1 }),
          copy({ price: 4, quantity: 1, tradelistQuantity: 1 }),
        ],
      },
    ],
    false,
  );
  assert.deepEqual(card.unitValues, [1, 4]);
  assert.equal(card.value, 5);
});

test("the printing a want named is marked and shown first", () => {
  const [card] = buildTradeCards(
    [
      {
        name: "Sol Ring",
        quantityWanted: 2,
        wantedSetCode: "mh2",
        wantedCollectorNumber: "123",
        copies: [
          copy({ price: 1, setCode: "c21", collectorNumber: "263" }),
          copy({ price: 40, setCode: "mh2", collectorNumber: "123" }),
        ],
      },
    ],
    false,
  );
  assert.equal(card.wantedPrinting, "MH2 #123");
  assert.equal(card.hasWantedPrinting, true);
  // The asked-for printing leads even though it is not the cheapest.
  assert.equal(card.copies[0].setCode, "mh2");
  assert.equal(card.copies[0].preferred, true);
  assert.equal(card.copies[1].preferred, false);
  // Valuation is unaffected: a trade still moves the cheapest copies.
  assert.deepEqual(card.unitValues, [1, 40]);
});

test("a set-only hint matches any collector number in that set", () => {
  const [card] = buildTradeCards(
    [
      {
        name: "Sol Ring",
        quantityWanted: 1,
        wantedSetCode: "mh2",
        copies: [copy({ setCode: "mh2", collectorNumber: "999" })],
      },
    ],
    false,
  );
  assert.equal(card.wantedPrinting, "MH2");
  assert.equal(card.hasWantedPrinting, true);
});

test("a wanted printing nobody holds is reported as missing", () => {
  const [card] = buildTradeCards(
    [
      {
        name: "Sol Ring",
        quantityWanted: 1,
        wantedSetCode: "mh2",
        wantedCollectorNumber: "123",
        copies: [copy({ setCode: "c21", collectorNumber: "263" })],
      },
    ],
    false,
  );
  assert.equal(card.hasWantedPrinting, false);
});

test("priority cards lead, whatever they are worth", () => {
  const cards = buildTradeCards(
    [
      { name: "Pricey", quantityWanted: 1, copies: [copy({ price: 50 })] },
      { name: "Wanted", quantityWanted: 1, priority: 1, copies: [copy({ price: 1 })] },
    ],
    false,
  );
  assert.deepEqual(
    cards.map((card) => card.name),
    ["Wanted", "Pricey"],
  );
});

/** A TradeCard reduced to what the even-up maths actually reads. */
function tradeCard(name: string, unitValues: number[]): TradeCard {
  return {
    name,
    quantityWanted: unitValues.length,
    quantityOwned: unitValues.length,
    quantityAvailable: unitValues.length,
    quantityMatched: unitValues.length,
    value: unitValues.length > 0 ? unitValues.reduce((sum, value) => sum + value, 0) : null,
    unitValues,
    lists: [],
    priority: 0,
    wantedPrinting: null,
    hasWantedPrinting: false,
    copies: [],
  };
}

test("an already even trade gets no suggestion", () => {
  const suggestion = suggestEvenUp([tradeCard("A", [10])], [tradeCard("B", [10])]);
  assert.equal(suggestion, null);
});

test("the heavier side is the one asked to drop cards", () => {
  const yours = suggestEvenUp([tradeCard("A", [30])], [tradeCard("B", [10])]);
  assert.equal(yours?.side, "you");

  const theirs = suggestEvenUp([tradeCard("A", [10])], [tradeCard("B", [30])]);
  assert.equal(theirs?.side, "them");
});

test("two small cards are picked over one big one when they fit better", () => {
  // Gap is $10. Taking the $9 leaves $1 out; the $6 and $4 close it exactly,
  // which a biggest-first pick would never find.
  const suggestion = suggestEvenUp(
    [tradeCard("Nine", [9]), tradeCard("Six", [6]), tradeCard("Four", [4])],
    [tradeCard("Theirs", [9])],
  );

  assert.equal(suggestion?.balanceBefore, 10);
  assert.equal(suggestion?.balanceAfter, 0);
  assert.deepEqual(
    suggestion?.drops.map((drop) => drop.name).sort(),
    ["Four", "Six"],
  );
});

test("overshooting is allowed when it lands closer than stopping short", () => {
  // Gap is $10 and the only card is $12: dropping it swings the trade $2 the
  // other way, which is closer to even than leaving the whole $10 standing.
  const suggestion = suggestEvenUp([tradeCard("Twelve", [12])], [tradeCard("Theirs", [2])]);
  assert.deepEqual(suggestion?.drops, [{ name: "Twelve", quantity: 1, value: 12 }]);
  assert.equal(suggestion?.balanceAfter, 2);
});

test("an equally good smaller concession wins the tie", () => {
  // Dropping the $8 or the $12 both leave $2 out; the one that gives up less
  // is the better advice.
  const suggestion = suggestEvenUp(
    [tradeCard("Twelve", [12]), tradeCard("Eight", [8])],
    [tradeCard("Theirs", [10])],
  );
  assert.deepEqual(suggestion?.drops, [{ name: "Eight", quantity: 1, value: 8 }]);
  assert.equal(suggestion?.balanceAfter, 2);
});

test("several copies of one card are dropped as a quantity", () => {
  const suggestion = suggestEvenUp(
    [tradeCard("Bolt", [5, 5, 5])],
    [tradeCard("Theirs", [5])],
  );
  assert.deepEqual(suggestion?.drops, [{ name: "Bolt", quantity: 2, value: 10 }]);
  assert.equal(suggestion?.balanceAfter, 0);
});

test("cents are respected rather than rounded away", () => {
  const suggestion = suggestEvenUp(
    [tradeCard("A", [3.33]), tradeCard("B", [1.67])],
    [tradeCard("Theirs", [1.67])],
  );
  assert.deepEqual(suggestion?.drops, [{ name: "A", quantity: 1, value: 3.33 }]);
  assert.equal(suggestion?.balanceAfter, 0);
});

test("a one-sided trade is not evened up by shrinking it to nothing", () => {
  assert.equal(suggestEvenUp([tradeCard("A", [30])], []), null);
  assert.equal(suggestEvenUp([], [tradeCard("A", [30])]), null);
});

test("no suggestion is made when dropping anything only makes it worse", () => {
  // The gap is $1.50 and the smallest card is $20; leaving it out would swing
  // the trade $18.50 the other way.
  assert.equal(
    suggestEvenUp([tradeCard("Big", [20]), tradeCard("Also", [20])], [tradeCard("Theirs", [38.5])]),
    null,
  );
});

test("a drop that barely dents the gap is not worth suggesting", () => {
  // Gap is $19.68 and the only droppable cards are a $48.47 (which overshoots
  // badly) and a $0.16. Closing 16 cents of it is not advice.
  const suggestion = suggestEvenUp(
    [tradeCard("Tithe", [48.47, 48.47]), tradeCard("Dockside", [0.16])],
    [tradeCard("Theirs", [77.42])],
  );
  assert.equal(suggestion, null);
});

test("balances are reported in whole cents", () => {
  // 10.10 + 5.05 - 1.10 lands on 14.049999999999999 in binary floating point;
  // a trade is quoted in money, not in drift.
  const suggestion = suggestEvenUp(
    [tradeCard("A", [10.1]), tradeCard("B", [5.05])],
    [tradeCard("Theirs", [1.1])],
  );
  assert.equal(suggestion?.balanceBefore, 14.05);
  assert.equal(suggestion?.balanceAfter, 1.1);
  assert.deepEqual(
    suggestion?.drops.map((drop) => drop.name).sort(),
    ["A", "B"],
  );
});
