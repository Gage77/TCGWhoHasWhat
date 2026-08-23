"use client";

import { useLayoutEffect } from "react";

import { applyTheme, themeStore, useTheme } from "@/lib/theme";

/**
 * Light or dark, in one button.
 *
 * Which icon shows is left to CSS rather than to React state, because the
 * server does not know the answer: rendering it from state would mean a moon
 * on every first paint, swapped for a sun once hydration caught up. The same
 * trick names the button for a screen reader — `hidden` keeps the wrong label
 * out of the accessibility tree, not just out of sight. Only the tooltip is
 * rendered from state, and it simply arrives a moment late.
 */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();

  /*
   * Nothing to do in production, where the script in <head> has already set
   * this. In development React remounts once under Strict Mode and resets the
   * attributes on <html> to the ones it manages itself, dropping the theme.
   */
  useLayoutEffect(() => {
    applyTheme(themeStore.read());
  }, []);

  return (
    <button
      onClick={toggle}
      title={theme === null ? undefined : `Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="rounded-lg p-2.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-emerald-600 sm:p-2 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
    >
      {/* In the dark, the button offers the sun. */}
      <svg
        viewBox="0 0 24 24"
        className="hidden size-5 dark:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="size-5 dark:hidden"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 13.3A8.5 8.5 0 1 1 10.7 3.5a6.6 6.6 0 0 0 9.8 9.8Z" />
      </svg>
      <span className="sr-only hidden dark:inline">Switch to light mode</span>
      <span className="sr-only dark:hidden">Switch to dark mode</span>
    </button>
  );
}
