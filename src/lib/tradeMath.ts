/**
 * Trade quantity and value arithmetic — pure, no network or database access.
 *
 * Kept separate from `trades.ts` so the rules that decide how much of a want
 * a trade actually satisfies, what that pile is worth, and how to even the
 * two piles up can be tested directly.
 */

export interface TradeCopy {
  setCode: string | null;
  collectorNumber: string | null;
  finish: string;
  condition: string | null;
  price: number | null;
  /** True when the price came from a different finish of the same printing. */
  priceApproximate: boolean;
  /** Art for this exact printing, which is how people tell versions apart. */
  imageUri: string | null;
  /** True when this is the printing the wanter actually asked for. */
  preferred: boolean;
}

/** One collection row, already priced. */
export interface PricedCopy extends Omit<TradeCopy, "preferred"> {
  quantity: number;
  tradelistQuantity: number;
}

/** One want, together with every copy the other person holds of it. */
export interface WantGroup {
  name: string;
  quantityWanted: number;
  copies: PricedCopy[];
  /** Which of the wanter's lists asked for this card. */
  lists?: string[];
  /** Highest priority any of those lists gave it. 1 = high. */
  priority?: number;
  /** Printing the wanter named, when their list was specific about one. */
  wantedSetCode?: string | null;
  wantedCollectorNumber?: string | null;
}

export interface TradeCard {
  /** The card's name as the holder's collection spells it. */
  name: string;
  quantityWanted: number;
  quantityOwned: number;
  /** Copies that could actually change hands, after the tradeable filter. */
  quantityAvailable: number;
  /** min(wanted, available) — what this card contributes to the trade. */
  quantityMatched: number;
  /** Value of the matched copies. Null when no copy has a known price. */
  value: number | null;
  /**
   * The price of each copy counted into `value`, cheapest first. Exposed so a
   * trade can be evened up a copy at a time rather than a card at a time.
   */
  unitValues: number[];
  /** Which of the wanter's lists asked for this card, for the "why". */
  lists: string[];
  /** Highest priority across those lists. 1 = high. */
  priority: number;
  /** Set when the wanter named a printing, e.g. "MH2 #123" or "MH2". */
  wantedPrinting: string | null;
  /** True when the holder actually has the printing that was asked for. */
  hasWantedPrinting: boolean;
  copies: TradeCopy[];
}

/** Does this copy match the printing the wanter asked for? */
function matchesWantedPrinting(copy: PricedCopy, group: WantGroup): boolean {
  if (!group.wantedSetCode) return false;
  if (copy.setCode?.toLowerCase() !== group.wantedSetCode.toLowerCase()) return false;
  if (!group.wantedCollectorNumber) return true;
  return copy.collectorNumber?.toLowerCase() === group.wantedCollectorNumber.toLowerCase();
}

function wantedPrintingLabel(group: WantGroup): string | null {
  if (!group.wantedSetCode) return null;
  const set = group.wantedSetCode.toUpperCase();
  return group.wantedCollectorNumber ? `${set} #${group.wantedCollectorNumber}` : set;
}

/**
 * Work out what each want contributes to a trade.
 *
 * Copies are valued cheapest first: whoever hands the card over would
 * reasonably part with their least valuable printing, which also keeps the
 * balance figure conservative. Wants with nothing available drop out.
 */
export function buildTradeCards(groups: WantGroup[], tradeableOnly: boolean): TradeCard[] {
  const cards: TradeCard[] = [];

  for (const group of groups) {
    let quantityOwned = 0;
    let quantityAvailable = 0;
    const usable: PricedCopy[] = [];

    for (const copy of group.copies) {
      const available = tradeableOnly ? copy.tradelistQuantity : copy.quantity;
      quantityOwned += copy.quantity;
      quantityAvailable += available;
      if (available > 0) usable.push({ ...copy, quantity: available });
    }

    const quantityMatched = Math.min(group.quantityWanted, quantityAvailable);
    if (quantityMatched <= 0) continue;

    // One entry per physical copy, cheapest first, limited to the copies the
    // trade would actually involve. Unpriced copies sort last so they never
    // displace a priced copy from the valuation.
    const unitValues = usable
      .flatMap((copy) => Array<number | null>(copy.quantity).fill(copy.price))
      .sort((a, b) => (a ?? Number.MAX_VALUE) - (b ?? Number.MAX_VALUE))
      .slice(0, quantityMatched)
      .filter((price): price is number => price !== null);

    cards.push({
      name: group.name,
      quantityWanted: group.quantityWanted,
      quantityOwned,
      quantityAvailable,
      quantityMatched,
      value: unitValues.length > 0 ? unitValues.reduce((sum, price) => sum + price, 0) : null,
      unitValues,
      lists: group.lists ?? [],
      priority: group.priority ?? 0,
      wantedPrinting: wantedPrintingLabel(group),
      hasWantedPrinting: usable.some((copy) => matchesWantedPrinting(copy, group)),
      copies: usable
        .map(
          (copy): TradeCopy => ({
            setCode: copy.setCode,
            collectorNumber: copy.collectorNumber,
            finish: copy.finish,
            condition: copy.condition,
            price: copy.price,
            priceApproximate: copy.priceApproximate,
            imageUri: copy.imageUri,
            preferred: matchesWantedPrinting(copy, group),
          }),
        )
        // The printing that was actually asked for leads, then cheapest first.
        .sort((a, b) => Number(b.preferred) - Number(a.preferred) || (a.price ?? 0) - (b.price ?? 0)),
    });
  }

  return cards.sort(
    (a, b) => b.priority - a.priority || (b.value ?? 0) - (a.value ?? 0),
  );
}

export interface EvenUpDrop {
  name: string;
  /** How many copies of this card to leave out. */
  quantity: number;
  /** Value those copies were contributing. */
  value: number;
}

export interface EvenUpSuggestion {
  /** Whose pile shrinks: "you" means you hand over fewer cards. */
  side: "you" | "them";
  drops: EvenUpDrop[];
  /** The gap the trade started with, as a positive number. */
  balanceBefore: number;
  /** The gap left after the drops, as a positive number. */
  balanceAfter: number;
}

interface Unit {
  cardIndex: number;
  cents: number;
}

// Past these the exact solver's table gets expensive for no real benefit;
// a playgroup trade is a dozen cards and a two-figure gap.
const MAX_UNITS_FOR_EXACT = 64;
const MAX_CENTS_FOR_EXACT = 500_000;

/**
 * The subset of units whose total is closest to `targetCents`.
 *
 * Exact subset-sum by reachability, which is what makes the suggestion
 * trustworthy — a greedy pick routinely misses that two small cards close a
 * gap a single big one overshoots. Sums beyond twice the target are never
 * worth considering: overshooting by more than the target leaves a bigger gap
 * than dropping nothing at all.
 */
function closestSubset(units: Unit[], targetCents: number): Unit[] {
  const bound = targetCents * 2;
  if (units.length > MAX_UNITS_FOR_EXACT || bound > MAX_CENTS_FOR_EXACT) {
    return greedySubset(units, targetCents);
  }

  const reachable = new Uint8Array(bound + 1);
  const fromItem = new Int32Array(bound + 1).fill(-1);
  const prevSum = new Int32Array(bound + 1).fill(-1);
  reachable[0] = 1;

  for (let i = 0; i < units.length; i++) {
    const weight = units[i].cents;
    if (weight <= 0 || weight > bound) continue;
    // Descending, so `reachable[s - weight]` still reflects the state before
    // this item and no item is used twice.
    for (let sum = bound; sum >= weight; sum--) {
      if (reachable[sum] || !reachable[sum - weight]) continue;
      reachable[sum] = 1;
      fromItem[sum] = i;
      prevSum[sum] = sum - weight;
    }
  }

  // Ascending with a strict improvement test, so when two subsets are equally
  // close the smaller concession is the one suggested.
  let best = 0;
  let bestError = targetCents;
  for (let sum = 1; sum <= bound; sum++) {
    if (!reachable[sum]) continue;
    const error = Math.abs(targetCents - sum);
    if (error < bestError) {
      bestError = error;
      best = sum;
    }
  }
  if (best === 0) return [];

  const chosen: Unit[] = [];
  for (let sum = best; sum > 0; sum = prevSum[sum]) chosen.push(units[fromItem[sum]]);
  return chosen;
}

/** Fallback for trades too large to solve exactly: biggest-first, then one overshoot. */
function greedySubset(units: Unit[], targetCents: number): Unit[] {
  const sorted = [...units].filter((unit) => unit.cents > 0).sort((a, b) => b.cents - a.cents);
  const chosen: Unit[] = [];
  const skipped: Unit[] = [];
  let remaining = targetCents;

  for (const unit of sorted) {
    if (unit.cents <= remaining) {
      chosen.push(unit);
      remaining -= unit.cents;
    } else {
      skipped.push(unit);
    }
  }

  // One overshoot can beat the leftover: dropping a $12 card to close a $10
  // gap leaves $2 on the table, which is closer than leaving the whole $10.
  const smallest = skipped[skipped.length - 1];
  if (smallest && Math.abs(remaining - smallest.cents) < remaining) chosen.push(smallest);

  return chosen;
}

/**
 * The gap has to close by at least this much of itself to be worth saying.
 *
 * Otherwise the advice is "give up a card and the trade is 1% fairer", which
 * nobody wants to read. When no subset clears this the honest answer is that
 * the cards on the table cannot be balanced.
 */
const MIN_CLOSED_FRACTION = 0.5;

/**
 * Which cards to leave out to bring the two piles closest to equal.
 *
 * Only the heavier side can shrink — you cannot conjure cards the other
 * person does not have — so this always answers "drop these". Returns null
 * when the trade is already even, when the light side is worth nothing (there
 * is no trade to balance then, only one to shrink to nothing), or when
 * nothing on the table closes a worthwhile share of the gap.
 */
export function suggestEvenUp(
  youHave: TradeCard[],
  theyHave: TradeCard[],
  options: { tolerance?: number } = {},
): EvenUpSuggestion | null {
  const tolerance = options.tolerance ?? 1;
  const youValue = totalValue(youHave);
  const theyValue = totalValue(theyHave);
  const balance = youValue - theyValue;
  if (Math.abs(balance) <= tolerance) return null;

  const heavy = balance > 0 ? youHave : theyHave;
  const light = balance > 0 ? theyHave : youHave;
  if (totalValue(light) <= 0) return null;

  const target = Math.abs(balance);
  const units: Unit[] = [];
  heavy.forEach((card, cardIndex) => {
    for (const value of card.unitValues) {
      units.push({ cardIndex, cents: Math.round(value * 100) });
    }
  });

  const chosen = closestSubset(units, Math.round(target * 100));
  if (chosen.length === 0) return null;


  const targetCents = Math.round(target * 100);
  const droppedCents = chosen.reduce((sum, unit) => sum + unit.cents, 0);
  const balanceAfter = Math.abs(targetCents - droppedCents) / 100;
  if (balanceAfter > (targetCents / 100) * MIN_CLOSED_FRACTION) return null;

  const byCard = new Map<number, EvenUpDrop>();
  for (const unit of chosen) {
    const card = heavy[unit.cardIndex];
    const drop = byCard.get(unit.cardIndex);
    if (drop) {
      drop.quantity += 1;
      drop.value += unit.cents / 100;
    } else {
      byCard.set(unit.cardIndex, { name: card.name, quantity: 1, value: unit.cents / 100 });
    }
  }

  return {
    side: balance > 0 ? "you" : "them",
    drops: [...byCard.values()].sort((a, b) => b.value - a.value),
    // Rounded to cents: these are sums of prices and the drift is noise.
    balanceBefore: targetCents / 100,
    balanceAfter,
  };
}

function totalValue(cards: TradeCard[]): number {
  return cards.reduce((sum, card) => sum + (card.value ?? 0), 0);
}
