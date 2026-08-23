/**
 * Turning somebody's cards into wants.
 *
 * A collection is a list of printings — four Lightning Bolts in three
 * conditions across two sets is six rows and one card you want. A want list is
 * a list of cards. Folding one into the other is the whole of this file, and
 * the two decisions it makes are worth stating.
 *
 * **One of each.** How many copies someone else has says nothing about how
 * many you want, so a bulk add asks for one and leaves you to say otherwise.
 * Adding a single card you are looking at is different: you picked that tile,
 * so the printing goes with it.
 *
 * **Capped.** "Add everything" against an unfiltered 20,000-card collection is
 * not a want list, it is a denial of service on the trades tab. Past the cap
 * the add still happens and says what it left out, rather than silently doing
 * a fraction of what was asked.
 *
 * No runtime imports: the tests load this file directly.
 */

/** Mirrors the `cards` payload the wants API accepts. */
export interface WantDraft {
  name: string;
  quantity: number;
  priority?: number;
  setCode?: string | null;
  collectorNumber?: string | null;
}

/** The fields of a collection row this needs; `BrowseCard` satisfies it. */
export interface CollectableCard {
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
}

export const BULK_LIMIT = 300;

export interface BulkWants {
  wants: WantDraft[];
  /** Distinct cards the filter actually matched, before any capping. */
  distinct: number;
  /** How many were left out by the cap; zero when everything fitted. */
  omitted: number;
}

/**
 * Fold a filtered collection down to one want per card.
 *
 * Matched case-insensitively on the name, which is coarser than the name keys
 * the rest of the app matches on but only has to be good enough to stop the
 * same card being asked for twice in one request — the wants API merges by the
 * real key when it stores them.
 */
export function collectionToWants(
  cards: CollectableCard[],
  options: { limit?: number } = {},
): BulkWants {
  const limit = options.limit ?? BULK_LIMIT;
  const seen = new Set<string>();
  const wants: WantDraft[] = [];
  let distinct = 0;

  for (const card of cards) {
    const name = card.name.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distinct++;

    // Kept counting past the cap so the caller can say what it left out.
    if (wants.length < limit) {
      // No printing: a bulk add is "these cards", not "these exact copies",
      // and pinning a printing would make the trade matcher fussier than the
      // person asking.
      wants.push({ name, quantity: 1 });
    }
  }

  return { wants, distinct, omitted: Math.max(0, distinct - wants.length) };
}

/**
 * One card, as picked off a shelf.
 *
 * The printing is recorded here because you were looking at it — the trades
 * tab says whether an offered copy is the version asked for, and that is only
 * meaningful when the ask came from a specific one.
 */
export function cardToWant(card: CollectableCard): WantDraft {
  return {
    name: card.name.trim(),
    quantity: 1,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
  };
}
