/**
 * Deck-mode arithmetic — pure, no network or database access.
 *
 * When a decklist is checked against its owner's own collection, each line
 * stops being "who has this?" and becomes "how many am I still short?".
 */

export interface OwnedCopy {
  ownerId: string;
  quantity: number;
}

export interface DeckNeed {
  /** Copies the searcher already holds. */
  quantityOwned: number;
  /** Copies still to find. Never negative. */
  quantityMissing: number;
  /** True when the searcher already has enough and the line can be dropped. */
  satisfied: boolean;
}

/**
 * Work out what is still needed for one decklist line.
 *
 * With no deck owner this is a plain pass-through, so the same code path
 * serves an ordinary search.
 */
export function deckNeed(
  quantityWanted: number,
  deckOwnerId: string | null,
  copies: OwnedCopy[],
): DeckNeed {
  if (!deckOwnerId) {
    return { quantityOwned: 0, quantityMissing: quantityWanted, satisfied: false };
  }

  const quantityOwned = copies
    .filter((copy) => copy.ownerId === deckOwnerId)
    .reduce((sum, copy) => sum + copy.quantity, 0);

  // Owning more copies than the deck calls for must not produce a negative
  // shortfall, which would otherwise subtract from the totals.
  const quantityMissing = Math.max(0, quantityWanted - quantityOwned);

  return { quantityOwned, quantityMissing, satisfied: quantityMissing === 0 };
}
