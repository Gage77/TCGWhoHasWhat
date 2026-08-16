/**
 * The actual "who has what" query: take a want list, find every copy across
 * the stored collections, and attach a current price to each copy.
 */

import { findCards, type CollectionHit } from "./db";
import { deckNeed } from "./deckNeed";
import { nameKeys, primaryKey } from "./normalize";
import { parseWantList } from "./parseList";
import { identifierKey, priceForFinish, resolveCards, type CardIdentifier } from "./scryfall";

export interface CopyMatch {
  setCode: string | null;
  setName: string | null;
  collectorNumber: string | null;
  finish: string;
  condition: string | null;
  language: string | null;
  quantity: number;
  tradelistQuantity: number;
  /** USD price for this exact printing and finish, when Scryfall knows it. */
  price: number | null;
  /** True when the price came from a different finish of the same printing. */
  priceApproximate: boolean;
  scryfallUri: string | null;
}

export interface OwnerMatch {
  ownerId: string;
  ownerName: string;
  totalQuantity: number;
  totalTradeable: number;
  /** Highest-value copy this owner holds, used for the summary column. */
  bestPrice: number | null;
  copies: CopyMatch[];
}

export interface SearchRow {
  /** The line as typed, so the user can spot their own typos. */
  query: string;
  quantityWanted: number;
  /** Deck mode: copies the searcher already has. Zero otherwise. */
  quantityOwned: number;
  /** Copies still needed — equal to quantityWanted outside deck mode. */
  quantityMissing: number;
  /** Scryfall's canonical name, when the card could be identified. */
  resolvedName: string | null;
  imageUri: string | null;
  scryfallUri: string | null;
  tcgplayerUri: string | null;
  /** Reference price for the default printing, shown when nobody has one. */
  referencePrice: number | null;
  /**
   * Price range across the copies actually found. This is the number that
   * matters for a trade — the reference printing is often a much cheaper
   * version than anyone in the group is holding.
   */
  foundPriceLow: number | null;
  foundPriceHigh: number | null;
  owners: OwnerMatch[];
  totalAvailable: number;
  totalTradeable: number;
}

export interface SearchSummary {
  cardsSearched: number;
  cardsFound: number;
  cardsMissing: number;
  unrecognized: string[];
  /** Combined value of the cheapest sufficient copies, as a trade ballpark. */
  totalValueFound: number;
  /**
   * Deck mode only: entries dropped because the searcher already owns enough
   * copies. Reported so a shrunken result set is obviously deliberate.
   */
  cardsAlreadyOwned: number;
  /** Deck mode only: total copies still needed across every row. */
  copiesNeeded: number;
}

export interface SearchResponse {
  rows: SearchRow[];
  summary: SearchSummary;
  /** Set when the list was checked against someone's own collection. */
  deckOwnerId: string | null;
}

export interface SearchOptions {
  /**
   * Whose collection to subtract first. Turns "who has these cards?" into
   * "what am I missing from this deck, and who has it?".
   */
  deckOwnerId?: string;
}

/** Build the best identifier available for a collection row. */
function identifierForHit(hit: CollectionHit): CardIdentifier {
  if (hit.scryfallId) return { kind: "id", id: hit.scryfallId };
  if (hit.setCode && hit.collectorNumber) {
    return { kind: "printing", setCode: hit.setCode, collectorNumber: hit.collectorNumber };
  }
  return { kind: "name", name: hit.name };
}

export async function runSearch(
  listText: string,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const deckOwnerId = options.deckOwnerId ?? null;
  const wanted = parseWantList(listText);
  if (wanted.length === 0) {
    return {
      rows: [],
      deckOwnerId,
      summary: {
        cardsSearched: 0,
        cardsFound: 0,
        cardsMissing: 0,
        unrecognized: [],
        totalValueFound: 0,
        cardsAlreadyOwned: 0,
        copiesNeeded: 0,
      },
    };
  }

  // Every key any wanted card could match under.
  const keyToWantedIndex = new Map<string, number>();
  const allKeys: string[] = [];
  wanted.forEach((card, index) => {
    for (const key of nameKeys(card.name)) {
      if (!keyToWantedIndex.has(key)) {
        keyToWantedIndex.set(key, index);
        allKeys.push(key);
      }
    }
  });

  const hits = await findCards(allKeys);

  // A hit can come back once per matching key (front face and full name);
  // keep one row per physical collection entry.
  const hitsByWanted = new Map<number, Map<number, CollectionHit>>();
  for (const hit of hits) {
    const index = keyToWantedIndex.get(hit.nameKey);
    if (index === undefined) continue;
    let bucket = hitsByWanted.get(index);
    if (!bucket) {
      bucket = new Map();
      hitsByWanted.set(index, bucket);
    }
    bucket.set(hit.cardId, hit);
  }

  // One Scryfall pass for every printing found plus every name searched.
  const identifiers: CardIdentifier[] = [];
  for (const bucket of hitsByWanted.values()) {
    for (const hit of bucket.values()) identifiers.push(identifierForHit(hit));
  }
  const referenceIdentifiers = wanted.map(
    (card): CardIdentifier => ({ kind: "name", name: card.name }),
  );
  identifiers.push(...referenceIdentifiers);

  const cards = await resolveCards(identifiers, { fuzzyFallback: true });

  const rows: SearchRow[] = [];
  const unrecognized: string[] = [];
  let totalValueFound = 0;
  let cardsAlreadyOwned = 0;
  let copiesNeeded = 0;

  wanted.forEach((want, index) => {
    const reference = cards.get(identifierKey({ kind: "name", name: want.name })) ?? null;

    const bucket = hitsByWanted.get(index) ?? new Map<number, CollectionHit>();
    const byOwner = new Map<string, OwnerMatch>();

    // In deck mode the searcher's own copies are subtracted from the ask
    // rather than listed as somewhere to get the card.
    const { quantityOwned, quantityMissing, satisfied } = deckNeed(
      want.quantity,
      deckOwnerId,
      [...bucket.values()],
    );

    if (satisfied) {
      cardsAlreadyOwned++;
      return;
    }
    copiesNeeded += quantityMissing;
    if (!reference) unrecognized.push(want.name);

    for (const hit of bucket.values()) {
      if (deckOwnerId && hit.ownerId === deckOwnerId) continue;
      const printing = cards.get(identifierKey(identifierForHit(hit))) ?? null;
      const { price, approximate } = printing
        ? priceForFinish(printing, hit.finish)
        : { price: null, approximate: false };

      let owner = byOwner.get(hit.ownerId);
      if (!owner) {
        owner = {
          ownerId: hit.ownerId,
          ownerName: hit.ownerName,
          totalQuantity: 0,
          totalTradeable: 0,
          bestPrice: null,
          copies: [],
        };
        byOwner.set(hit.ownerId, owner);
      }

      owner.totalQuantity += hit.quantity;
      owner.totalTradeable += hit.tradelistQuantity;
      if (price !== null && (owner.bestPrice === null || price > owner.bestPrice)) {
        owner.bestPrice = price;
      }
      owner.copies.push({
        setCode: hit.setCode,
        setName: printing?.setName ?? null,
        collectorNumber: hit.collectorNumber,
        finish: hit.finish,
        condition: hit.condition,
        language: hit.language,
        quantity: hit.quantity,
        tradelistQuantity: hit.tradelistQuantity,
        price,
        priceApproximate: approximate,
        scryfallUri: printing?.scryfallUri ?? null,
      });
    }

    const owners = [...byOwner.values()].sort(
      (a, b) => b.totalTradeable - a.totalTradeable || b.totalQuantity - a.totalQuantity,
    );
    for (const owner of owners) {
      owner.copies.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    }

    const totalAvailable = owners.reduce((sum, owner) => sum + owner.totalQuantity, 0);
    const totalTradeable = owners.reduce((sum, owner) => sum + owner.totalTradeable, 0);

    // Ballpark trade value: the cheapest copies that would cover what is
    // still needed (the whole ask, outside deck mode).
    const copyPrices = owners
      .flatMap((owner) => owner.copies.flatMap((copy) => Array<number | null>(copy.quantity).fill(copy.price)))
      .filter((price): price is number => price !== null)
      .sort((a, b) => a - b);
    totalValueFound += copyPrices
      .slice(0, quantityMissing)
      .reduce((sum, price) => sum + price, 0);

    rows.push({
      query: want.name,
      quantityWanted: want.quantity,
      quantityOwned,
      quantityMissing,
      resolvedName: reference?.name ?? null,
      imageUri: reference?.imageUri ?? null,
      scryfallUri: reference?.scryfallUri ?? null,
      tcgplayerUri: reference?.tcgplayerUri ?? null,
      referencePrice: reference?.prices.usd ?? null,
      foundPriceLow: copyPrices.length > 0 ? copyPrices[0] : null,
      foundPriceHigh: copyPrices.length > 0 ? copyPrices[copyPrices.length - 1] : null,
      owners,
      totalAvailable,
      totalTradeable,
    });
  });

  // Stable, useful ordering: unfound cards first so gaps are obvious.
  rows.sort((a, b) => {
    if (a.totalAvailable === 0 !== (b.totalAvailable === 0)) {
      return a.totalAvailable === 0 ? -1 : 1;
    }
    return a.query.localeCompare(b.query);
  });

  return {
    rows,
    deckOwnerId,
    summary: {
      cardsSearched: rows.length,
      cardsFound: rows.filter((row) => row.totalAvailable > 0).length,
      cardsMissing: rows.filter((row) => row.totalAvailable === 0).length,
      unrecognized,
      totalValueFound,
      cardsAlreadyOwned,
      copiesNeeded,
    },
  };
}

/** Exposed for tests: the key a name will be stored under. */
export { primaryKey };
