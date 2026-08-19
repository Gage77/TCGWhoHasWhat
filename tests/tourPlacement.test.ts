import { test } from "node:test";
import assert from "node:assert/strict";

import { placePopup, POPUP_WIDTH, type Box } from "../src/lib/tourPlacement.ts";

const VIEWPORT = { width: 1470, height: 684 };

test("a step with no target is centred", () => {
  const placement = placePopup(null, VIEWPORT);
  assert.equal(placement.side, "center");
});

test("a short target near the top gets the popup below it", () => {
  const box: Box = { left: 500, top: 60, width: 300, height: 40 };
  const placement = placePopup(box, VIEWPORT);
  assert.equal(placement.side, "below");
  assert.equal(placement.top, 60 + 40 + 14);
});

test("a target near the bottom gets the popup above it", () => {
  const box: Box = { left: 500, top: 600, width: 300, height: 40 };
  const placement = placePopup(box, VIEWPORT);
  assert.equal(placement.side, "above");
  // Anchored to the bottom edge so the popup needs no measuring to place.
  assert.equal(placement.bottom, VIEWPORT.height - 600 + 14);
  assert.equal(placement.top, undefined);
});

test("a full-height panel puts the popup beside it, not off the screen", () => {
  // The real collections panel: 561px tall in a 684px window, so there is
  // room neither above nor below it.
  const box: Box = { left: 111, top: 106, width: 320, height: 561 };
  const placement = placePopup(box, VIEWPORT);

  assert.equal(placement.side, "right");
  assert.equal(placement.left, 111 + 320 + 14);
  assert.ok(placement.top !== undefined && placement.top >= 16, "must not sit above the viewport");
  assert.ok(
    placement.top! + 260 <= VIEWPORT.height,
    "must not hang below the viewport",
  );
});

test("a tall panel on the right side puts the popup on its left", () => {
  const box: Box = { left: 1100, top: 106, width: 340, height: 561 };
  const placement = placePopup(box, VIEWPORT);
  assert.equal(placement.side, "left");
  assert.equal(placement.left, 1100 - 14 - POPUP_WIDTH);
});

test("the popup never hangs off the left or right edge", () => {
  const farLeft = placePopup({ left: 0, top: 40, width: 60, height: 30 }, VIEWPORT);
  assert.ok(farLeft.left! >= 16, `left edge: ${farLeft.left}`);

  const farRight = placePopup(
    { left: VIEWPORT.width - 60, top: 40, width: 60, height: 30 },
    VIEWPORT,
  );
  assert.ok(
    farRight.left! + POPUP_WIDTH <= VIEWPORT.width - 16,
    `right edge: ${farRight.left}`,
  );
});

test("a target filling the whole screen still gets a placement that fits", () => {
  const box: Box = { left: 0, top: 0, width: VIEWPORT.width, height: VIEWPORT.height };
  const placement = placePopup(box, VIEWPORT);
  assert.ok(placement.maxHeight! > 0, "must leave the popup somewhere to render");
  assert.ok(placement.left! >= 16);
});

test("maxHeight always keeps the popup inside the window", () => {
  const boxes: Box[] = [
    { left: 500, top: 60, width: 300, height: 40 },
    { left: 500, top: 600, width: 300, height: 40 },
    { left: 111, top: 106, width: 320, height: 561 },
  ];
  for (const box of boxes) {
    const placement = placePopup(box, VIEWPORT);
    assert.ok(
      placement.maxHeight! > 0 && placement.maxHeight! <= VIEWPORT.height,
      `maxHeight out of range for ${JSON.stringify(box)}: ${placement.maxHeight}`,
    );
  }
});
