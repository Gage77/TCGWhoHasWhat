/**
 * Want-list parsing.
 *
 * Accepts whatever people actually paste: bare card names, "4x Sol Ring",
 * Moxfield/Arena exports with printing hints ("1 Sol Ring (C21) 263"), and
 * MTGO-style sideboard prefixes. Deck-export section headers are ignored so a
 * whole decklist can be pasted straight in.
 */

export interface WantedCard {
  name: string;
  quantity: number;
  /** Printing hint from an export line, if the paste included one. */
  setCode: string | null;
  collectorNumber: string | null;
}

const SECTION_WORDS = new Set([
  "deck",
  "decklist",
  "sideboard",
  "commander",
  "companion",
  "maybeboard",
  "considering",
  "tokens",
  "about",
  "mainboard",
  "main",
  "sb",
]);

/** "Creatures (12)" and friends — a Moxfield category header, not a card. */
const CATEGORY_HEADER = /^[a-z][a-z\s'-]*\(\d+\)$/i;

/** Trailing "(C21) 263" / "(NEO)" printing hint from deck exports. */
const PRINTING_HINT = /\s*\(([A-Za-z0-9]{2,6})\)\s*([A-Za-z0-9★†-]+)?\s*$/;

/** MTGO/Deckbox foil markers, e.g. "Lightning Bolt *F*". */
const FOIL_MARKER = /\s*\*[FE]\*\s*$/i;

export function parseWantList(input: string): WantedCard[] {
  const wanted = new Map<string, WantedCard>();

  for (const rawLine of input.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    // Comments
    if (line.startsWith("//") || line.startsWith("#")) continue;

    // MTGO sideboard prefix
    line = line.replace(/^SB:\s*/i, "");

    // Leading quantity: "4x Sol Ring", "4 Sol Ring", "4 x Sol Ring"
    let quantity = 1;
    let hadQuantity = false;
    const quantityMatch = line.match(/^(\d+)\s*[xX]?\s+(.*)$/);
    if (quantityMatch) {
      const n = Number.parseInt(quantityMatch[1], 10);
      if (Number.isFinite(n) && n > 0) {
        quantity = n;
        line = quantityMatch[2].trim();
        hadQuantity = true;
      }
    }

    if (!line) continue;

    // Section headers only count as headers when no quantity was given,
    // so a card that happens to share the word still parses.
    if (!hadQuantity) {
      const bare = line.replace(/[:()\d\s]+$/, "").trim().toLowerCase();
      if (SECTION_WORDS.has(bare) || CATEGORY_HEADER.test(line)) continue;
    }

    line = line.replace(FOIL_MARKER, "").trim();

    let setCode: string | null = null;
    let collectorNumber: string | null = null;
    const printing = line.match(PRINTING_HINT);
    if (printing) {
      setCode = printing[1].toLowerCase();
      collectorNumber = printing[2] ?? null;
      line = line.slice(0, printing.index).trim();
    }

    // Trailing collector number left over from formats like "Sol Ring 263"
    // is ambiguous with card names, so it is deliberately left alone.

    if (!line) continue;

    const key = `${line.toLowerCase()}|${setCode ?? ""}|${collectorNumber ?? ""}`;
    const existing = wanted.get(key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      wanted.set(key, { name: line, quantity, setCode, collectorNumber });
    }
  }

  return [...wanted.values()];
}
