/**
 * Ordering the results of a search.
 *
 * The server hands back a deliberate order — cards nobody has first, so the
 * gaps in a list are the first thing you see — and that stays the default.
 * Everything here is what happens when somebody would rather see the table by
 * price, or by who has the most of it.
 *
 * Sorting client-side because the rows are all on the page already: a search
 * is one request for the whole list, so re-ordering it is a re-render, and a
 * sort that costs a round trip is a sort nobody clicks twice.
 *
 * No runtime imports beyond the row type: the tests load this file directly.
 */

import type { SearchRow } from "./search";

/**
 * Which column the table is ordered by. Owner columns carry the owner's id,
 * so a key is a string and can be the value of a `<select>` on a phone, where
 * there are no column headers to click.
 */
export type SortKey = "default" | "name" | "price" | `owner:${string}`;

export interface ResultSort {
  key: SortKey;
  descending: boolean;
}

export const DEFAULT_SORT: ResultSort = { key: "default", descending: false };

export function ownerSortKey(ownerId: string): SortKey {
  return `owner:${ownerId}`;
}

/** The owner an `owner:` key names, or null for the other columns. */
export function ownerIdOf(key: SortKey): string | null {
  return key.startsWith("owner:") ? key.slice("owner:".length) : null;
}

/**
 * Which way a column runs the first time it is clicked.
 *
 * Names read from A; money and counts are asked about from the top — nobody
 * clicks "price" hoping to see the cheapest card first.
 */
export function defaultDescending(key: SortKey): boolean {
  return key !== "default" && key !== "name";
}

/** A click on a column header: re-sort by it, or flip it if it is already. */
export function toggleSort(current: ResultSort, key: SortKey): ResultSort {
  if (current.key === key) return { key, descending: !current.descending };
  return { key, descending: defaultDescending(key) };
}

/** How many copies an owner has of this card, under the current filter. */
export function countFor(row: SearchRow, ownerId: string, tradeableOnly: boolean): number {
  const match = row.owners.find((entry) => entry.ownerId === ownerId);
  if (!match) return 0;
  return tradeableOnly ? match.totalTradeable : match.totalQuantity;
}

/**
 * The number the price column sorts on.
 *
 * The cheapest copy in the group, which is the first figure of the range the
 * column shows and the one a trade turns on — what getting this card would
 * actually cost. When nobody has one there is no range, only the reference
 * printing's price, which is what the column shows there too.
 */
export function priceOf(row: SearchRow): number | null {
  return row.foundPriceLow ?? row.referencePrice;
}

function nameOf(row: SearchRow): string {
  return row.resolvedName ?? row.query;
}

function byName(a: SearchRow, b: SearchRow): number {
  return nameOf(a).localeCompare(nameOf(b));
}

/**
 * Sorted rows, or the ones handed in when nothing was chosen.
 *
 * Ties break on the name so that flipping a column of mostly-zeroes twice
 * does not shuffle the rows underneath into a different arbitrary order.
 * Cards with no price at all sink either way: they are the rows with nothing
 * to say about the question being asked, not the cheapest cards on the list.
 */
export function sortRows(
  rows: SearchRow[],
  sort: ResultSort,
  tradeableOnly: boolean,
): SearchRow[] {
  if (sort.key === "default") return rows;

  const direction = sort.descending ? -1 : 1;
  const ownerId = ownerIdOf(sort.key);

  return [...rows].sort((a, b) => {
    if (ownerId !== null) {
      const difference = countFor(a, ownerId, tradeableOnly) - countFor(b, ownerId, tradeableOnly);
      return difference * direction || byName(a, b);
    }

    if (sort.key === "price") {
      const left = priceOf(a);
      const right = priceOf(b);
      if (left === null || right === null) {
        if (left === right) return byName(a, b);
        return left === null ? 1 : -1;
      }
      return (left - right) * direction || byName(a, b);
    }

    return byName(a, b) * direction;
  });
}
