import { test } from "node:test";
import assert from "node:assert/strict";

import { daysSince, freshnessOf, relativeDate } from "../src/lib/format.ts";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

test("a collection uploaded this week is fresh", () => {
  assert.equal(freshnessOf(daysAgo(0), NOW), "fresh");
  assert.equal(freshnessOf(daysAgo(13), NOW), "fresh");
});

test("a fortnight old is worth flagging quietly", () => {
  assert.equal(freshnessOf(daysAgo(14), NOW), "aging");
  assert.equal(freshnessOf(daysAgo(44), NOW), "aging");
});

test("six weeks old predates a set release and is stale", () => {
  assert.equal(freshnessOf(daysAgo(45), NOW), "stale");
  assert.equal(freshnessOf(daysAgo(400), NOW), "stale");
});

test("an unreadable date is not treated as evidence of staleness", () => {
  // A missing timestamp is a bug in our data, not an old collection, and
  // shouting about it on every trade would be noise.
  assert.equal(freshnessOf("not a date", NOW), "fresh");
  assert.equal(daysSince("not a date", NOW), null);
});

test("a date in the future does not read as stale", () => {
  assert.equal(freshnessOf(daysAgo(-5), NOW), "fresh");
});

test("relative dates read the way people say them", () => {
  assert.equal(relativeDate(daysAgo(0), NOW), "today");
  assert.equal(relativeDate(daysAgo(1), NOW), "yesterday");
  assert.equal(relativeDate(daysAgo(9), NOW), "9 days ago");
  assert.equal(relativeDate(daysAgo(35), NOW), "1 month ago");
  assert.equal(relativeDate(daysAgo(70), NOW), "2 months ago");
});
