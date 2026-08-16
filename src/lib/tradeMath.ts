/**
 * Trade quantity and value arithmetic — pure, no network or database access.
 *
 * Kept separate from `trades.ts` so the rules that decide how much of a want
 * a trade actually satisfies, and what that pile is worth, can be tested
 * directly.
 */

export interface TradeCopy {
  setCode: string | null;
  collectorNumber: string | null;
  finish: string;
  condition: string | null;
  price: number | null;
  /** True when the price came from a different finish of the same printing. */
  priceApproximate: boolean;
}

/** One collection row, already priced. */
export interface PricedCopy extends TradeCopy {
  quantity: number;
  tradelistQuantity: number;
}

/** One want, together with every copy the other person holds of it. */
export interface WantGroup {
  name: string;
  quantityWanted: number;
  copies: PricedCopy[];
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
  copies: TradeCopy[];
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
    const unitPrices = usable
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
      value: unitPrices.length > 0 ? unitPrices.reduce((sum, price) => sum + price, 0) : null,
      copies: usable
        .map(
          (copy): TradeCopy => ({
            setCode: copy.setCode,
            collectorNumber: copy.collectorNumber,
            finish: copy.finish,
            condition: copy.condition,
            price: copy.price,
            priceApproximate: copy.priceApproximate,
          }),
        )
        .sort((a, b) => (a.price ?? 0) - (b.price ?? 0)),
    });
  }

  return cards.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}
