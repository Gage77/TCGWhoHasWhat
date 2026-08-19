/**
 * Trade matching.
 *
 * The search page answers "who has this card?". This answers the question a
 * trade actually turns on: between two people, what does each hold that the
 * other is looking for, and are the two piles worth about the same?
 */

import { findWantMatches, listOwners, type WantMatch } from "./db";
import {
  buildTradeCards,
  suggestEvenUp,
  type EvenUpSuggestion,
  type PricedCopy,
  type TradeCard,
  type WantGroup,
} from "./tradeMath";
import {
  identifierKey,
  priceForFinish,
  resolveCards,
  type CardIdentifier,
  type ResolvedCard,
} from "./scryfall";

export interface TradePartner {
  ownerId: string;
  ownerName: string;
  /** When their collection was last uploaded, so the offer can be qualified. */
  ownerUpdatedAt: string;
  /** Cards they hold that you want. */
  theyHave: TradeCard[];
  /** Cards you hold that they want. */
  youHave: TradeCard[];
  theyHaveValue: number;
  youHaveValue: number;
  /** Positive means you would be giving up more value than you receive. */
  balance: number;
  totalCards: number;
  /** Which cards to leave out to bring the two piles level. Null when even. */
  evenUp: EvenUpSuggestion | null;
}

export interface TradeReport {
  ownerId: string;
  ownerName: string;
  /** When your own collection was last uploaded. */
  ownerUpdatedAt: string;
  partners: TradePartner[];
  /** Set when the chosen person has not saved a want list yet. */
  youHaveNoWants: boolean;
}

function identifierFor(match: WantMatch): CardIdentifier {
  if (match.scryfallId) return { kind: "id", id: match.scryfallId };
  if (match.setCode && match.collectorNumber) {
    return { kind: "printing", setCode: match.setCode, collectorNumber: match.collectorNumber };
  }
  return { kind: "name", name: match.cardName };
}

/**
 * Group raw matches by the card wanted, pricing each copy.
 *
 * Grouping is by the folded card name rather than by want row: the same card
 * can sit on several of one person's lists, and wanting a Sol Ring for two
 * decks is one Sol Ring to find, not two. The largest single ask wins, and
 * every list that asked comes along so the trade can say why.
 */
function groupByWant(matches: WantMatch[], cards: Map<string, ResolvedCard>): WantGroup[] {
  const groups = new Map<string, WantGroup & { seen: Set<number>; listNames: Set<string> }>();

  for (const match of matches) {
    let group = groups.get(match.wantKey);
    if (!group) {
      // Name the card as the collection spells it, not as the want list
      // does: "aangs iceberg" is a fine thing to type, but both people
      // should see the card's actual name on a trade list.
      group = {
        name: match.cardName,
        quantityWanted: match.wantQuantity,
        copies: [],
        lists: [],
        priority: match.wantPriority,
        wantedSetCode: match.wantSetCode,
        wantedCollectorNumber: match.wantCollectorNumber,
        seen: new Set(),
        listNames: new Set(),
      };
      groups.set(match.wantKey, group);
    }

    group.quantityWanted = Math.max(group.quantityWanted, match.wantQuantity);
    group.priority = Math.max(group.priority ?? 0, match.wantPriority);
    group.listNames.add(match.listName);
    // A printing named on any list is better than none named at all.
    if (!group.wantedSetCode && match.wantSetCode) {
      group.wantedSetCode = match.wantSetCode;
      group.wantedCollectorNumber = match.wantCollectorNumber;
    }

    // One row per physical collection entry: the same copy comes back once
    // per list that wanted it, and counting it twice would invent cards.
    if (group.seen.has(match.cardId)) continue;
    group.seen.add(match.cardId);

    const printing = cards.get(identifierKey(identifierFor(match))) ?? null;
    const { price, approximate } = printing
      ? priceForFinish(printing, match.finish)
      : { price: null, approximate: false };

    group.copies.push({
      setCode: match.setCode,
      collectorNumber: match.collectorNumber,
      finish: match.finish,
      condition: match.condition,
      price,
      priceApproximate: approximate,
      imageUri: printing?.imageUri ?? null,
      quantity: match.quantity,
      tradelistQuantity: match.tradelistQuantity,
    } satisfies PricedCopy);
  }

  return [...groups.values()].map((group) => ({
    name: group.name,
    quantityWanted: group.quantityWanted,
    copies: group.copies,
    priority: group.priority,
    wantedSetCode: group.wantedSetCode,
    wantedCollectorNumber: group.wantedCollectorNumber,
    lists: [...group.listNames].sort((a, b) => a.localeCompare(b)),
  }));
}

/**
 * Build the two-way trade picture between one person and everyone else.
 */
export async function buildTradeReport(
  ownerId: string,
  options: { tradeableOnly?: boolean } = {},
): Promise<TradeReport> {
  const tradeableOnly = options.tradeableOnly ?? false;

  const [owners, allMatches] = await Promise.all([listOwners(), findWantMatches()]);
  const me = owners.find((owner) => owner.id === ownerId);
  if (!me) throw new Error("That person is no longer in the group.");

  // Only the matches that involve me, in either direction.
  const iWant = allMatches.filter((match) => match.wanterId === ownerId);
  const theyWant = allMatches.filter((match) => match.holderId === ownerId);

  // One Scryfall pass covering both directions.
  const identifiers = [...iWant, ...theyWant].map(identifierFor);
  const cards = await resolveCards(identifiers);

  const partners: TradePartner[] = [];

  for (const other of owners) {
    if (other.id === ownerId) continue;

    const theyHave = buildTradeCards(
      groupByWant(iWant.filter((match) => match.holderId === other.id), cards),
      tradeableOnly,
    );
    const youHave = buildTradeCards(
      groupByWant(theyWant.filter((match) => match.wanterId === other.id), cards),
      tradeableOnly,
    );

    if (theyHave.length === 0 && youHave.length === 0) continue;

    const theyHaveValue = theyHave.reduce((sum, card) => sum + (card.value ?? 0), 0);
    const youHaveValue = youHave.reduce((sum, card) => sum + (card.value ?? 0), 0);

    partners.push({
      ownerId: other.id,
      ownerName: other.name,
      ownerUpdatedAt: other.updatedAt,
      theyHave,
      youHave,
      theyHaveValue,
      youHaveValue,
      balance: youHaveValue - theyHaveValue,
      totalCards:
        theyHave.reduce((sum, card) => sum + card.quantityMatched, 0) +
        youHave.reduce((sum, card) => sum + card.quantityMatched, 0),
      evenUp: suggestEvenUp(youHave, theyHave),
    });
  }

  // Best trades first: the ones with the most cards moving.
  partners.sort((a, b) => b.totalCards - a.totalCards);

  return {
    ownerId,
    ownerName: me.name,
    ownerUpdatedAt: me.updatedAt,
    partners,
    youHaveNoWants: iWant.length === 0,
  };
}

export type { EvenUpDrop, EvenUpSuggestion, TradeCard, TradeCopy } from "./tradeMath";
