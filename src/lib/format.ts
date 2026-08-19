const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : USD.format(value);
}

export function relativeDate(iso: string, now: number = Date.now()): string {
  const days = daysSince(iso, now);
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/**
 * How much to trust a collection's contents.
 *
 * A collection only changes when someone opens packs or trades, so a
 * fortnight is roughly a play cycle and six weeks means it predates at least
 * one set release. Past that, a trade offer built on it is a guess.
 */
export type Freshness = "fresh" | "aging" | "stale";

const AGING_DAYS = 14;
const STALE_DAYS = 45;

/** Whole days since `iso`, or null when it is not a date. */
export function daysSince(iso: string, now: number = Date.now()): number | null {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.floor((now - then) / 86_400_000);
}

export function freshnessOf(iso: string, now: number = Date.now()): Freshness {
  const days = daysSince(iso, now);
  // An unreadable date is not evidence of staleness, so it is left alone.
  if (days === null) return "fresh";
  if (days >= STALE_DAYS) return "stale";
  if (days >= AGING_DAYS) return "aging";
  return "fresh";
}
