import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { TOUR_STEPS, selectorFor } from "../src/lib/tour.ts";

const SRC = path.join(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Every `data-tour` attribute actually present in the UI. */
function markedTargets(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/data-tour="([a-z0-9-]+)"/g)) {
      found.set(match[1], path.relative(SRC, file));
    }
  }
  return found;
}

/**
 * These two tests are the reason the tour can be trusted: a feature that moves
 * or disappears takes its `data-tour` attribute with it, and the build then
 * says so instead of the tour quietly pointing at nothing.
 */
test("every tour step points at something that exists in the UI", () => {
  const marked = markedTargets();
  const missing = TOUR_STEPS.filter(
    (step) => step.target !== null && !marked.has(step.target),
  ).map((step) => step.target);

  assert.deepEqual(
    missing,
    [],
    `Tour steps point at data-tour attributes that no longer exist: ${missing.join(", ")}. ` +
      "Either restore the attribute or drop the step from src/lib/tour.ts.",
  );
});

test("every marked part of the UI is explained by a step", () => {
  const marked = markedTargets();
  const explained = new Set(TOUR_STEPS.map((step) => step.target));
  const unexplained = [...marked].filter(([target]) => !explained.has(target));

  assert.deepEqual(
    unexplained.map(([target]) => target),
    [],
    "These have a data-tour attribute but no step explaining them: " +
      `${unexplained.map(([target, file]) => `${target} (${file})`).join(", ")}. ` +
      "Add a step to src/lib/tour.ts, or remove the attribute.",
  );
});

test("steps are worth reading", () => {
  for (const step of TOUR_STEPS) {
    assert.ok(step.title.trim().length > 0, "a step has no title");
    assert.ok(step.body.trim().length > 20, `step "${step.title}" has barely any body text`);
  }
});

test("only steps that can be missing are marked skippable", () => {
  for (const step of TOUR_STEPS) {
    if (step.skipIfMissing) {
      assert.ok(step.target !== null, `"${step.title}" is skippable but targets nothing`);
    }
  }
});

test("the tour starts somewhere that always exists", () => {
  const first = TOUR_STEPS[0];
  assert.ok(first, "the tour has no steps");
  assert.ok(!first.skipIfMissing, "the first step must not be skippable");
});

test("selectorFor builds an attribute selector", () => {
  assert.equal(selectorFor("collections"), '[data-tour="collections"]');
});

/**
 * Components that only render inside one tab. A step pointing into one of
 * these without saying which tab would look for an element that is not on the
 * page yet, and quietly lose its spotlight.
 */
const TAB_ONLY_COMPONENTS: Record<string, "search" | "trades"> = {
  "components/TradesPanel.tsx": "trades",
  "components/WantLists.tsx": "trades",
  "components/ResultsTable.tsx": "search",
  "components/AddToWantList.tsx": "search",
};

test("steps pointing into a single tab say which tab that is", () => {
  const marked = markedTargets();
  const wrong: string[] = [];

  for (const [target, file] of marked) {
    const required = TAB_ONLY_COMPONENTS[file];
    if (!required) continue;

    const step = TOUR_STEPS.find((candidate) => candidate.target === target);
    if (step && step.tab !== required) {
      wrong.push(`"${target}" lives in ${file} so its step needs tab: "${required}"`);
    }
  }

  assert.deepEqual(wrong, [], wrong.join("; "));
});
