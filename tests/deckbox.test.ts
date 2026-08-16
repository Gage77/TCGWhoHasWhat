import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  parseDeckboxPage,
  parseDeckboxUrl,
  parseOwnerName,
  parsePageCount,
  setNameVariants,
} from "../src/lib/deckbox-parse.ts";

const fixture = readFileSync(new URL("./fixtures/deckbox-inventory.html", import.meta.url), "utf8");

test("parseDeckboxUrl accepts the URLs people copy", () => {
  assert.deepEqual(parseDeckboxUrl("https://deckbox.org/sets/700284"), {
    setId: "700284",
    tradelistOnly: false,
    canonicalUrl: "https://deckbox.org/sets/700284?s=i",
  });

  assert.equal(parseDeckboxUrl("deckbox.org/sets/700284?s=i&o=d").setId, "700284");
  assert.equal(parseDeckboxUrl("https://www.deckbox.org/sets/700284").setId, "700284");
  assert.equal(parseDeckboxUrl("700284").setId, "700284");
});

test("parseDeckboxUrl detects the tradelist view", () => {
  const source = parseDeckboxUrl("https://deckbox.org/sets/700284?s=t");
  assert.equal(source.tradelistOnly, true);
  assert.match(source.canonicalUrl, /s=t/);
});

test("parseDeckboxUrl refuses other hosts", () => {
  // The URL is fetched server-side, so anything but Deckbox is an SSRF risk.
  assert.throws(() => parseDeckboxUrl("https://evil.example.com/sets/1"), /Only deckbox\.org/);
  assert.throws(() => parseDeckboxUrl("http://169.254.169.254/latest/meta-data"), /Only deckbox\.org/);
  assert.throws(() => parseDeckboxUrl("https://deckbox.org.evil.com/sets/1"), /Only deckbox\.org/);
  assert.throws(() => parseDeckboxUrl("https://deckbox.org/users/someone"), /inventory/);
});

test("parseDeckboxPage extracts cards from a real inventory page", () => {
  const cards = parseDeckboxPage(fixture);
  assert.equal(cards.length, 5);

  const first = cards[0];
  assert.equal(first.name, "Abandon Hope");
  assert.equal(first.setName, "Tempest");
  assert.equal(first.collectorNumber, "1");
  assert.equal(first.quantity, 1);
  assert.equal(first.condition, "Near Mint");
  assert.equal(first.language, "English");
  assert.equal(first.finish, "normal");
  // Deckbox gives set names, not codes; the code is resolved separately.
  assert.equal(first.setCode, null);
});

test("parseDeckboxPage keeps both faces of a double-faced card", () => {
  const cards = parseDeckboxPage(fixture);
  const dfc = cards.find((card) => card.name.includes("//"));
  assert.ok(dfc, "fixture should contain a double-faced card");
  assert.equal(dfc.name, "Aberrant Researcher // Perfected Form");
});

test("parseDeckboxPage ignores the price link and reads the card name", () => {
  // The price cell is also an <a class='simple'>, so a naive selector would
  // pick up "$0.24" as the card name.
  const cards = parseDeckboxPage(fixture);
  for (const card of cards) {
    assert.doesNotMatch(card.name, /^\$/, `parsed a price as a name: ${card.name}`);
  }
});

test("parseDeckboxPage tolerates a row with no printing tooltip", () => {
  const row = `<table><tr id="1">
    <td class="inventory_count card_count">3</td>
    <td><a class='simple' href='https://deckbox.org/mtg/Some%20Promo'>Some Promo</a></td>
  </tr></table>`;
  const [card] = parseDeckboxPage(row);
  assert.equal(card.name, "Some Promo");
  assert.equal(card.quantity, 3);
  assert.equal(card.setName, null);
  assert.equal(card.collectorNumber, null);
});

test("parseDeckboxPage decodes HTML entities in names", () => {
  const row = `<table><tr id="1">
    <td class="card_count">1</td>
    <td><a class='simple' href='/mtg/x'>Urza&#39;s Saga &amp; Friends</a></td>
  </tr></table>`;
  assert.equal(parseDeckboxPage(row)[0].name, "Urza's Saga & Friends");
});

test("parsePageCount finds the last page from the pager", () => {
  assert.equal(parsePageCount(fixture), 282);
  assert.equal(parsePageCount("<html>no pager</html>"), 1);
});

test("parseOwnerName reads the owner from the page title", () => {
  assert.equal(parseOwnerName(fixture), "Askew37");
  assert.equal(parseOwnerName("<title>Something else</title>"), null);
});

test("setNameVariants strips the descriptors Deckbox adds", () => {
  // Deckbox says "Magic 2014 Core Set"; Scryfall says "Magic 2014".
  assert.deepEqual(setNameVariants("Magic 2014 Core Set"), ["Magic 2014 Core Set", "Magic 2014"]);
  assert.deepEqual(setNameVariants("Modern Masters 2017 Edition"), [
    "Modern Masters 2017 Edition",
    "Modern Masters 2017",
  ]);
  // Names that already match are left alone.
  assert.deepEqual(setNameVariants("Tempest"), ["Tempest"]);
  assert.deepEqual(setNameVariants("Time Spiral Timeshifted"), ["Time Spiral Timeshifted"]);
});
