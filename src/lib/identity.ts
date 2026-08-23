"use client";

/**
 * Who the user is, remembered between visits.
 *
 * Every part of the app needs it for a different reason — the search tab to
 * subtract your own collection, the trades tab to know whose side you are on,
 * the collection viewer to know whose want list a card should go on — so it is
 * asked once, on the dashboard, and read from here everywhere else.
 *
 * Read through `useSyncExternalStore` because that is what localStorage is:
 * the server render has nobody chosen, and the value arrives on hydration
 * without a render-then-correct flicker.
 */

import { useSyncExternalStore } from "react";

import type { Owner } from "./db";

const IDENTITY_KEY = "who-has-what:me";

export const identityStore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    identityStore.listeners.add(listener);
    // Another tab switching person should not leave this one out of date.
    window.addEventListener("storage", listener);
    return () => {
      identityStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },

  read(): string {
    return window.localStorage.getItem(IDENTITY_KEY) ?? "";
  },

  write(id: string) {
    if (id) window.localStorage.setItem(IDENTITY_KEY, id);
    else window.localStorage.removeItem(IDENTITY_KEY);
    for (const listener of identityStore.listeners) listener();
  },
};

export function useIdentity(owners: Owner[]): [string, (id: string) => void] {
  const stored = useSyncExternalStore(identityStore.subscribe, identityStore.read, () => "");

  // A remembered collection can be removed out from under the choice.
  const meId = owners.some((owner) => owner.id === stored) ? stored : "";
  return [meId, identityStore.write];
}
