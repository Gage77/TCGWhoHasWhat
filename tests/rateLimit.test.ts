import { test } from "node:test";
import assert from "node:assert/strict";

import { clientKey, createLimiter } from "../src/lib/rateLimit.ts";

const WINDOW = 10 * 60 * 1000;

function limiter(limit = 3, maxKeys?: number) {
  return createLimiter({ limit, windowMs: WINDOW, maxKeys });
}

test("attempts are allowed up to the limit", () => {
  const attempts = limiter();
  for (let i = 0; i < 3; i++) {
    assert.equal(attempts.check("a", 0).allowed, true);
    attempts.fail("a", 0);
  }
  assert.equal(attempts.check("a", 0).allowed, false);
});

test("a blocked caller is told how long to wait", () => {
  const attempts = limiter();
  for (let i = 0; i < 3; i++) attempts.fail("a", 0);

  // Nine minutes into a ten-minute window.
  const decision = attempts.check("a", 9 * 60 * 1000);
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterSeconds, 60);
});

test("the wait is never reported as zero seconds", () => {
  const attempts = limiter();
  for (let i = 0; i < 3; i++) attempts.fail("a", 0);
  // A hair inside the window: rounding down would say "try again in 0s".
  assert.equal(attempts.check("a", WINDOW - 1).retryAfterSeconds, 1);
});

test("the window expires and the count starts over", () => {
  const attempts = limiter();
  for (let i = 0; i < 3; i++) attempts.fail("a", 0);
  assert.equal(attempts.check("a", WINDOW - 1).allowed, false);
  assert.equal(attempts.check("a", WINDOW).allowed, true);
});

test("the window runs from the first failure, not the last", () => {
  const attempts = limiter();
  attempts.fail("a", 0);
  attempts.fail("a", 5 * 60 * 1000);
  attempts.fail("a", 9 * 60 * 1000);
  assert.equal(attempts.check("a", 9 * 60 * 1000).allowed, false);
  // A late failure must not push the window out; it opened at zero.
  assert.equal(attempts.check("a", WINDOW).allowed, true);
});

test("getting it right clears the failures", () => {
  const attempts = limiter();
  for (let i = 0; i < 3; i++) attempts.fail("a", 0);
  attempts.succeed("a");
  assert.equal(attempts.check("a", 0).allowed, true);
});

test("one caller's failures do not lock out another", () => {
  const attempts = limiter();
  for (let i = 0; i < 3; i++) attempts.fail("a", 0);
  assert.equal(attempts.check("a", 0).allowed, false);
  assert.equal(attempts.check("b", 0).allowed, true);
});

test("tracking is capped so forged addresses cannot exhaust memory", () => {
  const attempts = limiter(3, 10);
  for (let i = 0; i < 500; i++) attempts.fail(`forged-${i}`, 0);

  // The most recent key survived, so a real caller behind the spray is still
  // counted; the map did not grow to 500.
  assert.equal(attempts.check("forged-499", 0).allowed, true);
  attempts.fail("forged-499", 0);
  attempts.fail("forged-499", 0);
  assert.equal(attempts.check("forged-499", 0).allowed, false);
});

test("expired windows are dropped before live ones when pruning", () => {
  const attempts = limiter(3, 10);
  for (let i = 0; i < 9; i++) attempts.fail(`old-${i}`, 0);
  // A window later, every one of those is dead and should be reclaimed
  // rather than costing a live caller their slot.
  for (let i = 0; i < 9; i++) attempts.fail(`new-${i}`, WINDOW);
  attempts.fail("new-0", WINDOW);
  attempts.fail("new-0", WINDOW);
  assert.equal(attempts.check("new-0", WINDOW).allowed, false);
});

test("the client key is the first hop in x-forwarded-for", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
  assert.equal(clientKey(headers), "203.0.113.7");
});

test("x-real-ip is used when there is no forwarding chain", () => {
  assert.equal(clientKey(new Headers({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
});

test("callers with no address share one bucket rather than none", () => {
  assert.equal(clientKey(new Headers()), "unknown");
  // An empty header is no address at all, not an address named "".
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "  " })), "unknown");
});
