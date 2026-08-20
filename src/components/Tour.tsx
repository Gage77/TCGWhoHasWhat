"use client";

import { useEffect, useRef, useState } from "react";

import { selectorFor, type TourStep } from "@/lib/tour";
import {
  NOMINAL_HEIGHT,
  POPUP_WIDTH,
  placePopup,
  type Box,
  type Viewport,
} from "@/lib/tourPlacement";

interface Props {
  steps: TourStep[];
  /** Index into `steps`, or null when the tour is not running. */
  index: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}

const SPOTLIGHT_PADDING = 8;
const MARGIN = 16;

/** Bring the target into view, but leave the page alone if it already is. */
function revealTarget(element: HTMLElement): void {
  const box = element.getBoundingClientRect();
  const fullyVisible = box.top >= MARGIN && box.bottom <= window.innerHeight - MARGIN;
  if (!fullyVisible) element.scrollIntoView({ block: "center" });
}

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/**
 * A guided walk through the page.
 *
 * The dark surround is one element sized to the highlighted control with a
 * very large box-shadow spread, which is far cheaper than four divs forming a
 * frame and gives a real hole rather than a lightened rectangle.
 */
export function Tour({ steps, index, onIndex, onClose }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  // Measured rather than read at render time so that rotating a phone, or the
  // address bar sliding away under a scroll, moves the popup with it.
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const running = index !== null;
  const step = running ? steps[index] : undefined;
  const target = step?.target ?? null;

  // Measuring is done in a frame callback rather than in the effect body: the
  // step may have just switched tabs, and the element it points at does not
  // exist until that render has painted.
  useEffect(() => {
    if (!running) return;

    let frame = 0;
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const element = target
        ? document.querySelector<HTMLElement>(selectorFor(target))
        : null;
      if (!element) {
        setBox(null);
        return;
      }
      revealTarget(element);
      setBox(boxOf(element));
    };

    frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    // Capture phase, so scrolling inside the results table repositions too.
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [running, target]);

  /**
   * Start each step at its own beginning, with the focus on Next.
   *
   * `autoFocus` would do the focusing, but it scrolls what it focuses into
   * view — and on a short screen the popup is a scrolling box with Next at
   * the bottom, so the step arrived already scrolled past its own title.
   */
  useEffect(() => {
    if (!running) return;
    popupRef.current?.scrollTo({ top: 0 });
    nextRef.current?.focus({ preventScroll: true });
  }, [running, index]);

  useEffect(() => {
    if (!running) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") onIndex(index + 1);
      else if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, index, onIndex, onClose]);

  if (!running || !step) return null;

  const isLast = index === steps.length - 1;

  // The effect has not run on the very first frame; by then we are certainly
  // in a browser, so measuring inline for that one render is safe.
  const size = viewport ?? { width: window.innerWidth, height: window.innerHeight };
  // A fixed 340px popup hangs off the side of a narrow phone, and 260px of
  // assumed height is most of a phone screen — both are ceilings here, not
  // sizes.
  const popupWidth = Math.min(POPUP_WIDTH, size.width - MARGIN * 2);
  const nominalHeight = Math.min(NOMINAL_HEIGHT, Math.round(size.height * 0.45));

  const placement = placePopup(box, size, popupWidth, nominalHeight);
  const position: React.CSSProperties =
    placement.side === "center"
      ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)", maxHeight: placement.maxHeight }
      : {
          left: placement.left,
          top: placement.top,
          bottom: placement.bottom,
          maxHeight: placement.maxHeight,
        };

  return (
    <>
      {/* Swallows clicks so the page cannot be driven out from under the tour. */}
      <div className="fixed inset-0 z-40" aria-hidden="true" />

      {box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-emerald-400/70 transition-all duration-200"
          style={{
            left: box.left - SPOTLIGHT_PADDING,
            top: box.top - SPOTLIGHT_PADDING,
            width: box.width + SPOTLIGHT_PADDING * 2,
            height: box.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(9, 9, 11, 0.65)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-zinc-950/65" />
      )}

      <div
        ref={popupRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl sm:p-5 dark:border-zinc-700 dark:bg-zinc-900"
        style={{ width: popupWidth, ...position }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="text-base font-semibold">
            {step.title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close the tour"
            className="-mr-1 -mt-1 shrink-0 rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
            {index + 1} of {steps.length}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="rounded-lg px-2.5 py-2 text-sm whitespace-nowrap text-zinc-500 transition hover:text-zinc-700 sm:px-3 sm:py-1.5 dark:hover:text-zinc-300"
            >
              {isLast ? "Close" : "Skip"}
            </button>
            {index > 0 && (
              <button
                onClick={() => onIndex(index - 1)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-50 sm:py-1.5 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Back
              </button>
            )}
            {!isLast && (
              <button
                ref={nextRef}
                onClick={() => onIndex(index + 1)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 sm:py-1.5"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** The compass that starts it. */
export function TourButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-tour="tour-button"
      title="Show me around"
      aria-label="Show me around"
      className="rounded-lg p-2.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-emerald-600 sm:p-2 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path
          d="m15.5 8.5-2.1 5.1-5.1 2.1 2.1-5.1z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
