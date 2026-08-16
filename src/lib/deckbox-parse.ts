/**
 * Deckbox HTML parsing — pure functions, no network or database access.
 *
 * Split out from the fetching layer so the parsers can be tested against a
 * saved page without pulling in the Scryfall and storage modules.
 */

import type { CollectionCard, Finish } from "./csv";

/** A parsed row before its set name has been resolved to a set code. */
export interface DeckboxRow extends CollectionCard {
  setName: string | null;
}

const HOST = "deckbox.org";

/** Fixed by Deckbox; no page-size parameter is honoured. */
export const DECKBOX_PAGE_SIZE = 30;
/** ~30k cards. Guards against a runaway fetch. */
export const DECKBOX_MAX_PAGES = 1000;

export interface DeckboxSource {
  /** Numeric set id from the URL, e.g. 700284. */
  setId: string;
  /** Deckbox filters the same set id down to the tradelist with ?s=t. */
  tradelistOnly: boolean;
  canonicalUrl: string;
}

/**
 * Accepts the URLs people actually copy out of the address bar:
 * a full inventory link, one with view/sort parameters, or a bare set id.
 *
 * Rejects any other host. This URL is fetched server-side, so letting it
 * point anywhere would turn the import into an SSRF vector.
 */
export function parseDeckboxUrl(input: string): DeckboxSource {
  const raw = input.trim();
  if (!raw) throw new Error("Paste a Deckbox collection link.");

  if (/^\d+$/.test(raw)) {
    return { setId: raw, tradelistOnly: false, canonicalUrl: setUrl(raw, false) };
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("That does not look like a URL.");
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== HOST) {
    throw new Error(`Only ${HOST} links can be imported. Use a CSV upload for other sites.`);
  }

  const match = url.pathname.match(/\/sets\/(\d+)/);
  if (!match) {
    throw new Error(
      "Use the link to a Deckbox inventory, which looks like https://deckbox.org/sets/123456",
    );
  }

  const tradelistOnly = url.searchParams.get("s") === "t";
  return { setId: match[1], tradelistOnly, canonicalUrl: setUrl(match[1], tradelistOnly) };
}

export function setUrl(setId: string, tradelistOnly: boolean, page = 1): string {
  const url = new URL(`https://${HOST}/sets/${setId}`);
  url.searchParams.set("s", tradelistOnly ? "t" : "i");
  if (page > 1) url.searchParams.set("p", String(page));
  return url.toString();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

const ROW = /<tr[^>]*id="\d+"[^>]*>([\s\S]*?)<\/tr>/g;
const QUANTITY = /class="[^"]*card_count[^"]*"[^>]*>\s*(\d+)\s*</;
/** The card-name anchor is the one pointing at a /mtg/ card page. */
const NAME = /<a[^>]+href=['"][^'"]*\/mtg\/[^'"]*['"][^>]*>([^<]*)<\/a>/;
/** Set symbol tooltip, e.g. data-title="Tempest (Card #1)". */
const PRINTING = /data-title="([^"]+?)\s*\(Card #([^)]*)\)"/;
const CONDITION =
  /data-title='(Mint|Near Mint|Good \(Lightly Played\)|Lightly Played|Played|Heavily Played|Poor)'/;
const LANGUAGE =
  /data-title='(English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Russian|Simplified Chinese|Traditional Chinese)'/;

/**
 * Foil marking could not be confirmed against a live collection (the sample
 * used for development contained none), so several plausible markers are
 * accepted and anything unrecognised falls back to a normal finish. A missed
 * foil only softens pricing, which already falls back across finishes.
 */
function detectFinish(row: string): Finish {
  if (/data-title='[^']*etched[^']*'/i.test(row)) return "etched";
  if (/data-title='[^']*foil[^']*'/i.test(row) || /class='[^']*\bfoil\b[^']*'/i.test(row)) {
    return "foil";
  }
  return "normal";
}

/** Parse one inventory page into collection rows. */
export function parseDeckboxPage(html: string): DeckboxRow[] {
  const cards: DeckboxRow[] = [];

  for (const match of html.matchAll(ROW)) {
    const row = match[1];

    const name = row.match(NAME)?.[1];
    if (!name) continue;

    const quantity = Number.parseInt(row.match(QUANTITY)?.[1] ?? "1", 10) || 1;
    const printing = row.match(PRINTING);

    cards.push({
      name: decodeEntities(name).trim(),
      // Deckbox names the set rather than giving its code; Scryfall resolves
      // the printing from the collector number and name instead.
      setCode: null,
      setName: printing ? decodeEntities(printing[1]).trim() : null,
      collectorNumber: printing ? printing[2].trim() : null,
      quantity,
      // Deckbox splits inventory and tradelist into separate views rather
      // than separate counts, so the view being imported decides this.
      tradelistQuantity: quantity,
      finish: detectFinish(row),
      condition: row.match(CONDITION)?.[1] ?? null,
      language: row.match(LANGUAGE)?.[1] ?? null,
      scryfallId: null,
    });
  }

  return cards;
}

/**
 * Candidate spellings of a set name, best first.
 *
 * Deckbox writes out fuller set names than Scryfall does — "Magic 2014 Core
 * Set" against "Magic 2014", "Modern Masters 2017 Edition" against "Modern
 * Masters 2017" — so trailing descriptors are progressively dropped until a
 * match is found.
 */
export function setNameVariants(setName: string): string[] {
  const variants: string[] = [];
  let current = setName.trim();

  while (current) {
    if (!variants.includes(current)) variants.push(current);
    const stripped = current.replace(/\s+(core set|edition|set)$/i, "").trim();
    if (stripped === current) break;
    current = stripped;
  }

  return variants;
}

/** Highest page number referenced by the pager links. */
export function parsePageCount(html: string): number {
  let highest = 1;
  for (const match of html.matchAll(/[?&]p=(\d+)/g)) {
    const page = Number.parseInt(match[1], 10);
    if (Number.isFinite(page) && page > highest) highest = page;
  }
  return highest;
}

/** Deckbox puts the owner's name in the title: "Askew37's Inventory - Deckbox". */
export function parseOwnerName(html: string): string | null {
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  if (!title) return null;
  const owner = decodeEntities(title).match(/^\s*(.+?)'s\s+/);
  return owner ? owner[1].trim() : null;
}
