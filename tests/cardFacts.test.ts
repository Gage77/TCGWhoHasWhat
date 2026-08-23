import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { encodeColors, toCardFacts } from "../src/lib/cardFacts.ts";
import type { ScryfallCard } from "../src/lib/scryfall.ts";

/**
 * Real Scryfall responses, trimmed to the fields this app reads.
 *
 * Hand-written card JSON would agree with whatever the projection happens to
 * do; these six disagree with it in the specific ways real cards do — a
 * transforming card with no colours of its own, a split card whose colours
 * come back out of order, a land that is two colours while being none.
 */
const CARDS: ScryfallCard[] = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "scryfall-cards.json"), "utf8"),
);

function card(name: string): ScryfallCard {
  const found = CARDS.find((entry) => entry.name === name);
  assert.ok(found, `fixture is missing ${name}`);
  return found;
}

test("colours are stored in WUBRG order however they arrive", () => {
  assert.equal(encodeColors(["R", "U"]), "UR");
  assert.equal(encodeColors(["U", "R"]), "UR");
  assert.equal(encodeColors(["G", "W", "B"]), "WBG");
  assert.equal(encodeColors(["W", "U", "B", "R", "G"]), "WUBRG");
});

test("a colourless card is an empty string, not a missing one", () => {
  assert.equal(encodeColors([]), "");
  assert.equal(encodeColors(null), "");
  assert.equal(encodeColors(undefined), "");
});

test("an ordinary card keeps what it says", () => {
  const facts = toCardFacts(card("Abhorrent Oculus"));

  assert.equal(facts.colors, "U");
  assert.equal(facts.colorIdentity, "U");
  assert.equal(facts.cmc, 3);
  assert.equal(facts.manaCost, "{2}{U}");
  assert.equal(facts.power, "5");
  assert.equal(facts.toughness, "5");
  assert.equal(facts.rarity, "mythic");
  assert.match(facts.typeLine, /Creature/);
  assert.match(facts.oracleText ?? "", /Flying/);
});

/**
 * The distinction the whole colour filter rests on. A dual land produces two
 * colours of mana while being colourless itself, so filtering a Commander
 * collection by "green" has to mean identity or the lands all vanish.
 */
test("a land is colourless but not identity-less", () => {
  const facts = toCardFacts(card("Breeding Pool"));

  assert.equal(facts.colors, "");
  // Blue before green: the stored order is WUBRG, not the order Scryfall
  // happens to list them in or the order the card's name suggests.
  assert.equal(facts.colorIdentity, "UG");
  assert.equal(facts.cmc, 0);
});

test("a card with no colours at all is empty on both counts", () => {
  const facts = toCardFacts(card("Sol Ring"));

  assert.equal(facts.colors, "");
  assert.equal(facts.colorIdentity, "");
  assert.equal(facts.manaCost, "{1}");
});

/**
 * Scryfall gives a transforming card no top-level colours, mana cost, oracle
 * text or power — only faces that have them. Read naively, every flip card in
 * a collection would be a colourless zero-drop with no text to search.
 */
test("a transforming card takes its colours and cost from its faces", () => {
  const facts = toCardFacts(card("Delver of Secrets // Insectile Aberration"));

  assert.equal(facts.layout, "transform");
  assert.equal(facts.colors, "U", "front face is blue even though the card lists no colours");
  assert.equal(facts.manaCost, "{U}");
  assert.equal(facts.power, "1", "front face's power, not nothing");
  assert.match(facts.oracleText ?? "", /transform/i);
});

test("both faces of a double-faced card are searchable text", () => {
  const facts = toCardFacts(card("Agadeem's Awakening // Agadeem, the Undercrypt"));

  assert.equal(facts.colors, "B");
  assert.match(facts.oracleText ?? "", /Return from your graveyard/i, "front face");
  assert.match(facts.oracleText ?? "", /enters tapped/i, "back face");
});

test("a split card is every colour on either half", () => {
  const facts = toCardFacts(card("Fire // Ice"));

  // Scryfall returns these as ["R", "U"]; stored order must not depend on it.
  assert.equal(facts.colors, "UR");
  assert.equal(facts.colorIdentity, "UR");
  assert.match(facts.typeLine, /Instant/);
});

test("every fixture card projects to something storable", () => {
  for (const raw of CARDS) {
    const facts = toCardFacts(raw);

    assert.ok(facts.scryfallId, `${raw.name} has no id`);
    assert.ok(facts.name, `${raw.name} lost its name`);
    assert.ok(facts.setCode, `${raw.name} has no set code`);
    assert.equal(typeof facts.cmc, "number", `${raw.name} has a non-numeric mana value`);
    assert.ok(facts.typeLine.length > 0, `${raw.name} has an empty type line`);
    assert.ok(facts.imageNormal, `${raw.name} has no image to show`);
    assert.ok(
      typeof facts.legalities.commander === "string",
      `${raw.name} carries no commander legality`,
    );
  }
});
