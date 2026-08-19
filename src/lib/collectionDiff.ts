/**
 * What changed between two versions of a collection — pure, no database.
 *
 * Re-uploading is the only way a CSV-sourced collection ever gets fresher,
 * and doing it blind feels pointless: you export, you upload, nothing visibly
 * happens. Telling someone what actually moved is what makes it worth doing
 * again before the next game night.
 */

/** One card's presence in a collection, already summed across printings. */
export interface CountedCard {
  name: string;
  quantity: number;
  tradelistQuantity: number;
}

export interface CollectionDiff {
  /** No previous collection to compare against, so nothing is "new". */
  firstUpload: boolean;
  /** Distinct cards that were not there before. */
  addedCards: number;
  /** Distinct cards that have gone entirely. */
  removedCards: number;
  /** Copies gained, counting extra copies of cards already held. */
  copiesAdded: number;
  copiesRemoved: number;
  /** Distinct cards with more copies marked for trade than before. */
  newlyTradeable: number;
  /** A few of the new card names, so the summary can be concrete. */
  examples: string[];
}

const EXAMPLE_LIMIT = 3;

/** Cards are compared by folded name; the default suits a plain list. */
function defaultKey(card: CountedCard): string {
  return card.name.trim().toLowerCase();
}

function total(cards: CountedCard[], keyOf: (card: CountedCard) => string) {
  const totals = new Map<string, CountedCard>();
  for (const card of cards) {
    const key = keyOf(card);
    const running = totals.get(key);
    if (running) {
      running.quantity += card.quantity;
      running.tradelistQuantity += card.tradelistQuantity;
    } else {
      totals.set(key, { ...card });
    }
  }
  return totals;
}

export function diffCollections(
  before: CountedCard[] | null,
  after: CountedCard[],
  keyOf: (card: CountedCard) => string = defaultKey,
): CollectionDiff {
  const empty = {
    firstUpload: before === null,
    addedCards: 0,
    removedCards: 0,
    copiesAdded: 0,
    copiesRemoved: 0,
    newlyTradeable: 0,
    examples: [],
  } satisfies CollectionDiff;

  if (before === null) return empty;

  const was = total(before, keyOf);
  const now = total(after, keyOf);
  const diff: CollectionDiff = { ...empty, examples: [] };
  const added: string[] = [];

  for (const [key, card] of now) {
    const previous = was.get(key);
    if (!previous) {
      diff.addedCards += 1;
      diff.copiesAdded += card.quantity;
      added.push(card.name);
      if (card.tradelistQuantity > 0) diff.newlyTradeable += 1;
      continue;
    }

    if (card.quantity > previous.quantity) diff.copiesAdded += card.quantity - previous.quantity;
    if (card.quantity < previous.quantity) diff.copiesRemoved += previous.quantity - card.quantity;
    if (card.tradelistQuantity > previous.tradelistQuantity) diff.newlyTradeable += 1;
  }

  for (const [key, card] of was) {
    if (now.has(key)) continue;
    diff.removedCards += 1;
    diff.copiesRemoved += card.quantity;
  }

  diff.examples = added.sort((a, b) => a.localeCompare(b)).slice(0, EXAMPLE_LIMIT);
  return diff;
}

function plural(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

/**
 * The change in a sentence fragment, or null when there is nothing to say.
 *
 * Distinct cards lead, because "14 new cards" is what someone wants to hear.
 * Extra copies of cards already held only get a mention when nothing else
 * moved, otherwise every summary turns into a list of numbers.
 */
export function describeDiff(diff: CollectionDiff): string | null {
  if (diff.firstUpload) return null;

  const parts: string[] = [];
  if (diff.addedCards > 0) parts.push(plural(diff.addedCards, "new card", "new cards"));
  if (diff.removedCards > 0) parts.push(`${diff.removedCards.toLocaleString()} gone`);

  if (parts.length === 0) {
    if (diff.copiesAdded > 0) parts.push(plural(diff.copiesAdded, "more copy", "more copies"));
    if (diff.copiesRemoved > 0) parts.push(plural(diff.copiesRemoved, "fewer copy", "fewer copies"));
  }

  if (diff.newlyTradeable > 0) {
    parts.push(`${diff.newlyTradeable.toLocaleString()} newly up for trade`);
  }

  if (parts.length === 0) return "nothing has changed since last time";
  return parts.join(", ");
}
