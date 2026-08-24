"use client";

/**
 * Rows or card art, remembered between visits.
 *
 * Which one somebody wants is a fact about them rather than about a search —
 * people who recognise cards by their art want the art every time — so the
 * choice outlives the results it was made on.
 *
 * Read through `useSyncExternalStore` for the same reason identity is: there
 * is no localStorage on the server, and the value arrives on hydration rather
 * than as a render-then-correct flicker.
 */

import { useSyncExternalStore } from "react";

export type ResultView = "rows" | "gallery";

const VIEW_KEY = "who-has-what:result-view";

/** Rows: the denser of the two, and the one the table was built as. */
const FALLBACK: ResultView = "rows";

export const resultViewStore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    resultViewStore.listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      resultViewStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },

  read(): ResultView {
    return window.localStorage.getItem(VIEW_KEY) === "gallery" ? "gallery" : FALLBACK;
  },

  write(view: ResultView) {
    if (view === FALLBACK) window.localStorage.removeItem(VIEW_KEY);
    else window.localStorage.setItem(VIEW_KEY, view);
    for (const listener of resultViewStore.listeners) listener();
  },
};

export function useResultView(): [ResultView, (view: ResultView) => void] {
  const view = useSyncExternalStore(
    resultViewStore.subscribe,
    resultViewStore.read,
    () => FALLBACK,
  );
  return [view, resultViewStore.write];
}
