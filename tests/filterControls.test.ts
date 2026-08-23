import { test } from "node:test";
import assert from "node:assert/strict";

import { parseQuery } from "../src/lib/cardQuery.ts";
import {
  EMPTY_CONTROLS,
  activeFilterCount,
  controlsToQuery,
  fullQuery,
  readControls,
  toggle,
  writeControls,
  type FilterControls,
} from "../src/lib/filterControls.ts";

function controls(overrides: Partial<FilterControls>): FilterControls {
  return { ...EMPTY_CONTROLS, ...overrides };
}

test("nothing selected filters nothing", () => {
  assert.equal(controlsToQuery(EMPTY_CONTROLS), "");
  assert.equal(activeFilterCount(EMPTY_CONTROLS), 0);
});

/**
 * The convention every faceted list uses: more rarities means more results,
 * a rarity plus a colour means fewer.
 */
test("a group is OR-ed inside and AND-ed against other groups", () => {
  assert.equal(controlsToQuery(controls({ rarities: ["rare"] })), "r:rare");
  assert.equal(
    controlsToQuery(controls({ rarities: ["rare", "mythic"] })),
    "(r:rare or r:mythic)",
  );
  assert.equal(
    controlsToQuery(controls({ rarities: ["rare", "mythic"], colors: ["W"] })),
    "c:w (r:rare or r:mythic)",
  );
});

test("ranges become comparisons", () => {
  assert.equal(controlsToQuery(controls({ mvMin: 2, mvMax: 5 })), "mv>=2 mv<=5");
  assert.equal(controlsToQuery(controls({ priceMin: 1 })), "usd>=1");
  assert.equal(controlsToQuery(controls({ priceMax: 10 })), "usd<=10");
  // Zero is a real bound and must not be mistaken for "unset".
  assert.equal(controlsToQuery(controls({ mvMin: 0 })), "mv>=0");
});

test("the yes/no controls become is: terms", () => {
  assert.equal(
    controlsToQuery(controls({ tradeableOnly: true, foilOnly: true })),
    "is:tradeable is:foil",
  );
});

/**
 * The point of generating query text rather than filtering separately: what
 * the controls produce has to be something the parser accepts, or the two
 * halves of the filter are two different features.
 */
test("everything the controls produce parses without warnings", () => {
  const everything = controls({
    colors: ["W", "U", "C"],
    types: ["Creature", "Land"],
    rarities: ["rare", "mythic"],
    sets: ["lea", "dom"],
    mvMin: 1,
    mvMax: 6,
    priceMin: 0.5,
    priceMax: 25,
    tradeableOnly: true,
    foilOnly: true,
  });

  const { node, warnings } = parseQuery(controlsToQuery(everything));

  assert.deepEqual(warnings, [], "the controls wrote something the parser rejected");
  assert.ok(node, "the controls wrote a query that filters nothing");
});

test("controls and typed text combine into one query", () => {
  const query = fullQuery("bolt", controls({ colors: ["R"] }));

  assert.equal(query, "bolt c:r");
  assert.deepEqual(parseQuery(query).warnings, []);
});

test("either half alone is still a whole query", () => {
  assert.equal(fullQuery("  bolt  ", EMPTY_CONTROLS), "bolt");
  assert.equal(fullQuery("", controls({ colors: ["R"] })), "c:r");
  assert.equal(fullQuery("   ", EMPTY_CONTROLS), "");
});

test("a multi-word type is quoted so it survives being read back", () => {
  const query = controlsToQuery(controls({ types: ["Legendary Creature"] }));

  assert.equal(query, 't:"legendary creature"');
  assert.deepEqual(parseQuery(query).warnings, []);
});

test("the filter round-trips through a URL", () => {
  const original = controls({
    colors: ["W", "U"],
    types: ["Creature"],
    rarities: ["mythic"],
    sets: ["dom"],
    mvMin: 2,
    priceMax: 30,
    tradeableOnly: true,
  });

  const params = new URLSearchParams(writeControls(original));
  assert.deepEqual(readControls(params), original);
});

test("an empty filter writes no parameters at all", () => {
  assert.deepEqual(writeControls(EMPTY_CONTROLS), {});
  assert.deepEqual(readControls(new URLSearchParams()), EMPTY_CONTROLS);
});

test("junk in the URL is ignored rather than fatal", () => {
  const params = new URLSearchParams("colors=&mvmin=banana&pricemax=&trade=yes");
  const read = readControls(params);

  assert.deepEqual(read.colors, []);
  assert.equal(read.mvMin, null);
  assert.equal(read.priceMax, null);
  assert.equal(read.tradeableOnly, false, "only an explicit 1 turns it on");
});

test("counting active filters counts each choice, not each group", () => {
  assert.equal(activeFilterCount(controls({ colors: ["W", "U"] })), 2);
  assert.equal(
    activeFilterCount(controls({ colors: ["W"], mvMin: 1, mvMax: 3, tradeableOnly: true })),
    4,
  );
});

test("toggling adds then removes", () => {
  assert.deepEqual(toggle([], "W"), ["W"]);
  assert.deepEqual(toggle(["W"], "U"), ["W", "U"]);
  assert.deepEqual(toggle(["W", "U"], "W"), ["U"]);
});
