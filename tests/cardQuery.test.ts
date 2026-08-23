import { test } from "node:test";
import assert from "node:assert/strict";

import { parseQuery, type Condition, type QueryNode } from "../src/lib/cardQuery.ts";

/** The single condition a one-term query parsed to. */
function only(input: string): Condition {
  const { node, warnings } = parseQuery(input);
  assert.deepEqual(warnings, [], `unexpected warnings for ${input}`);
  assert.ok(node, `${input} parsed to nothing`);
  assert.equal(node.kind, "term", `${input} is not a single term`);
  return (node as { kind: "term"; condition: Condition }).condition;
}

function nodeOf(input: string): QueryNode {
  const { node } = parseQuery(input);
  assert.ok(node, `${input} parsed to nothing`);
  return node;
}

test("a bare word searches names", () => {
  assert.deepEqual(only("bolt"), { field: "name", value: "bolt" });
});

test("several bare words are separate name terms, not one phrase", () => {
  // "sol ring" without quotes is two constraints, both of which Sol Ring
  // satisfies — the same thing Scryfall does, and it keeps "lim vault" working.
  const node = nodeOf("sol ring");
  assert.equal(node.kind, "and");
  assert.equal((node as { nodes: QueryNode[] }).nodes.length, 2);
});

test("a quoted phrase stays whole", () => {
  assert.deepEqual(only('o:"draw a card"'), { field: "oracle", value: "draw a card" });
});

test("field aliases fold to one name", () => {
  for (const input of ["mv:3", "cmc:3", "manavalue:3"]) {
    assert.deepEqual(only(input), { field: "cmc", cmp: "=", value: 3 });
  }
  for (const input of ["t:creature", "type:creature"]) {
    assert.deepEqual(only(input), { field: "type", value: "creature" });
  }
});

test("comparators are kept as written", () => {
  assert.deepEqual(only("mv<=3"), { field: "cmc", cmp: "<=", value: 3 });
  assert.deepEqual(only("mv>3"), { field: "cmc", cmp: ">", value: 3 });
  assert.deepEqual(only("usd>=5.5"), { field: "price", cmp: ">=", value: 5.5 });
  assert.deepEqual(only("pow!=2"), { field: "power", cmp: "!=", value: 2 });
});

/**
 * The distinction that makes colour filtering useful. A bare `c:u` is "at
 * least blue" — Sphinx's Revelation counts. `c=u` is mono-blue only. And
 * `id<=wu` is the Commander question: does this fit in my Azorius deck?
 */
test("a colon means at least these colours", () => {
  assert.deepEqual(only("c:u"), { field: "colors", op: "includes", colors: "U" });
  assert.deepEqual(only("c:uw"), { field: "colors", op: "includes", colors: "WU" });
});

test("equals means exactly these colours", () => {
  assert.deepEqual(only("c=u"), { field: "colors", op: "exact", colors: "U" });
});

test("at-most is how a deck's colour identity is asked for", () => {
  assert.deepEqual(only("id<=wu"), { field: "identity", op: "subset", colors: "WU" });
  assert.deepEqual(only("ci<=esper"), { field: "identity", op: "subset", colors: "WUB" });
});

test("guild and shard names are colours", () => {
  assert.deepEqual(only("c:azorius"), { field: "colors", op: "includes", colors: "WU" });
  assert.deepEqual(only("c:jund"), { field: "colors", op: "includes", colors: "BRG" });
  assert.deepEqual(only("c:blue"), { field: "colors", op: "includes", colors: "U" });
});

test("colours are normalized to WUBRG however they are typed", () => {
  assert.deepEqual(only("c:gu"), { field: "colors", op: "includes", colors: "UG" });
  assert.deepEqual(only("c:rw"), { field: "colors", op: "includes", colors: "WR" });
});

test("colourless and multicolour are their own things", () => {
  assert.deepEqual(only("c:c"), { field: "colors", op: "exact", colors: "" });
  assert.deepEqual(only("c:m"), { field: "colors", op: "multicolor", colors: "" });
});

test("rarity accepts a prefix and orders", () => {
  assert.deepEqual(only("r:m"), { field: "rarity", cmp: "=", value: "mythic" });
  assert.deepEqual(only("r>=rare"), { field: "rarity", cmp: ">=", value: "rare" });
});

test("a leading minus negates, and a hyphen inside a name does not", () => {
  const negated = nodeOf("-t:creature");
  assert.equal(negated.kind, "not");

  // Plenty of cards are hyphenated; that must not read as a negation.
  assert.deepEqual(only("Fire-Blast"), { field: "name", value: "Fire-Blast" });
});

test("or splits, and adjacency joins", () => {
  const node = nodeOf("c:u or c:r");
  assert.equal(node.kind, "or");
  assert.equal((node as { nodes: QueryNode[] }).nodes.length, 2);

  const both = nodeOf("c:u t:instant");
  assert.equal(both.kind, "and");
});

test("brackets group", () => {
  const node = nodeOf("t:creature (c:u or c:r)");
  assert.equal(node.kind, "and");
  const [left, right] = (node as { nodes: QueryNode[] }).nodes;
  assert.equal(left.kind, "term");
  assert.equal(right.kind, "or");
});

test("an empty query filters nothing rather than everything", () => {
  assert.equal(parseQuery("").node, null);
  assert.equal(parseQuery("   ").node, null);
});

/**
 * A long query with one typo in it should lose the typo, not the query. The
 * alternative — refusing the lot — means retyping a working filter because of
 * one character.
 */
test("an unknown filter is dropped with a reason, keeping the rest", () => {
  const { node, warnings } = parseQuery("t:creature banana:yes c:u");

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /banana/);
  assert.ok(node);
  assert.equal(node.kind, "and");
  assert.equal((node as { nodes: QueryNode[] }).nodes.length, 2, "the two good terms survive");
});

test("nonsense values are reported in words that say what to do", () => {
  assert.match(parseQuery("mv:banana").warnings[0], /needs a number/);
  assert.match(parseQuery("c:purple").warnings[0], /not a colour/);
  assert.match(parseQuery("is:shiny").warnings[0], /Known: /);
  assert.match(parseQuery("r:legendary").warnings[0], /not a rarity/);
});

test("an unclosed bracket is closed rather than fatal", () => {
  const { node, warnings } = parseQuery("(t:creature c:u");
  assert.ok(node);
  assert.match(warnings[0], /bracket/);
});

test("collection properties are queryable alongside card ones", () => {
  assert.deepEqual(only("is:foil"), { field: "is", value: "foil" });
  assert.deepEqual(only("is:tradeable"), { field: "is", value: "tradeable" });
  assert.deepEqual(only("qty>=4"), { field: "quantity", cmp: ">=", value: 4 });
  assert.deepEqual(only("cond:NM"), { field: "condition", value: "NM" });
});
