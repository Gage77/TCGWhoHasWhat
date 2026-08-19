/**
 * Where to put the tour's popup — pure, so the awkward cases can be tested
 * without a browser.
 *
 * The hard case is a target taller than the space around it: the collections
 * panel runs almost the full height of the window, so there is room neither
 * above nor below it and the popup has to go beside it instead.
 */

export interface Viewport {
  width: number;
  height: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Side = "below" | "above" | "right" | "left" | "center";

export interface Placement {
  side: Side;
  left?: number;
  top?: number;
  /** Set instead of `top` when anchoring upward, so no height is needed. */
  bottom?: number;
  /** Never let the popup run off the screen; it scrolls inside instead. */
  maxHeight?: number;
}

export const POPUP_WIDTH = 340;
/** Enough room for a typical step before it has been rendered and measured. */
export const NOMINAL_HEIGHT = 260;
const GAP = 14;
const MARGIN = 16;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function placePopup(
  box: Box | null,
  viewport: Viewport,
  popupWidth: number = POPUP_WIDTH,
  nominalHeight: number = NOMINAL_HEIGHT,
): Placement {
  // Nothing to point at: the step is about the app, so centre it.
  if (!box) return { side: "center", maxHeight: viewport.height - MARGIN * 2 };

  const below = viewport.height - (box.top + box.height);
  const above = box.top;
  const right = viewport.width - (box.left + box.width);
  const left = box.left;

  const verticalNeeded = nominalHeight + GAP + MARGIN;
  const horizontalNeeded = popupWidth + GAP + MARGIN;

  /** Centred on the target horizontally, but never off either edge. */
  const alignedLeft = clamp(
    box.left + box.width / 2 - popupWidth / 2,
    MARGIN,
    viewport.width - popupWidth - MARGIN,
  );

  /** Roughly level with the target, but never off the top or bottom. */
  const alignedTop = clamp(
    box.top + box.height / 2 - nominalHeight / 2,
    MARGIN,
    viewport.height - nominalHeight - MARGIN,
  );

  if (below >= verticalNeeded) {
    return {
      side: "below",
      left: alignedLeft,
      top: box.top + box.height + GAP,
      maxHeight: below - GAP - MARGIN,
    };
  }

  if (above >= verticalNeeded) {
    return {
      side: "above",
      left: alignedLeft,
      bottom: viewport.height - box.top + GAP,
      maxHeight: above - GAP - MARGIN,
    };
  }

  // Too tall to sit above or below — go alongside.
  if (right >= horizontalNeeded) {
    return {
      side: "right",
      left: box.left + box.width + GAP,
      top: alignedTop,
      maxHeight: viewport.height - MARGIN * 2,
    };
  }

  if (left >= horizontalNeeded) {
    return {
      side: "left",
      left: box.left - GAP - popupWidth,
      top: alignedTop,
      maxHeight: viewport.height - MARGIN * 2,
    };
  }

  // Nowhere it fits cleanly: take the roomier of above and below and let the
  // popup scroll inside itself rather than run off the screen.
  return below >= above
    ? {
        side: "below",
        left: alignedLeft,
        top: box.top + box.height + GAP,
        maxHeight: Math.max(120, below - GAP - MARGIN),
      }
    : {
        side: "above",
        left: alignedLeft,
        bottom: viewport.height - box.top + GAP,
        maxHeight: Math.max(120, above - GAP - MARGIN),
      };
}
