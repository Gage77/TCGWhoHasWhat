/**
 * The theme, as the page's very first act.
 *
 * Split out from `theme.ts` rather than living beside the store, because the
 * root layout is a Server Component and cannot import a module that reaches
 * for `useSyncExternalStore` — so what `<head>` needs is kept clear of React
 * entirely.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "who-has-what:theme";

/** The page background per theme, kept in step with `globals.css`. */
export const PAGE_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#0a0a0a" };

export const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/**
 * The same work as `applyTheme`, in a form that can run from `<head>` before
 * React exists — which is the whole point of it: a theme applied on hydration
 * is a theme the user watches arrive. The `try` is for browsers with storage
 * switched off, where following the system is the right answer anyway.
 */
export const themeBootScript = `(function(){try{
var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});
var t=s==="light"||s==="dark"?s:(matchMedia(${JSON.stringify(SYSTEM_DARK)}).matches?"dark":"light");
document.documentElement.dataset.theme=t;
document.documentElement.style.colorScheme=t;
}catch(e){}})()`;
