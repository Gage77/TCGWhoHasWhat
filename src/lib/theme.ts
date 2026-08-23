"use client";

/**
 * Light or dark, and who decides.
 *
 * The operating system decides until somebody says otherwise, and then the
 * choice sticks. Only a disagreement is written down: choosing the theme the
 * system already asked for forgets the override instead of pinning it, so the
 * way back to "whatever my laptop is doing" is the same button, and a machine
 * that switches at sunset carries the app with it.
 *
 * Read through `useSyncExternalStore` for the same reason identity is: the
 * server render has no localStorage to consult. What has to happen before
 * React exists at all is in `themeBoot.ts`.
 */

import { useSyncExternalStore } from "react";

import { PAGE_COLOR, SYSTEM_DARK, THEME_KEY, type Theme } from "./themeBoot";

export type { Theme };

function systemTheme(): Theme {
  return window.matchMedia(SYSTEM_DARK).matches ? "dark" : "light";
}

/** The override, if there is one and it still means something. */
function storedTheme(): Theme | null {
  const value = window.localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : null;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  // Scrollbars, dropdowns and form controls are drawn by the browser, and
  // would otherwise stay on whatever the operating system thinks.
  root.style.colorScheme = theme;
  // So is the browser chrome on a phone, which is most of where this is used.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", PAGE_COLOR[theme]);
  }
}

export const themeStore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    themeStore.listeners.add(listener);
    const system = window.matchMedia(SYSTEM_DARK);
    // Two things change the answer from outside this tab: another tab
    // toggling, and the system going dark at sunset under an app that never
    // overrode it. Resolving through `read` means a stored choice wins either
    // way, so the second is a no-op for anyone who has chosen.
    const sync = () => {
      applyTheme(themeStore.read());
      listener();
    };
    window.addEventListener("storage", sync);
    system.addEventListener("change", sync);

    return () => {
      themeStore.listeners.delete(listener);
      window.removeEventListener("storage", sync);
      system.removeEventListener("change", sync);
    };
  },

  read(): Theme {
    return storedTheme() ?? systemTheme();
  },

  write(theme: Theme) {
    // Agreeing with the system is not an override worth keeping.
    if (theme === systemTheme()) window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    for (const listener of themeStore.listeners) listener();
  },
};

/** The current theme — null until hydrated — and the way to flip it. */
export function useTheme(): [Theme | null, () => void] {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.read, () => null);
  return [theme, () => themeStore.write(theme === "dark" ? "light" : "dark")];
}
