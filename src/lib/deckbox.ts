/**
 * Deckbox collection import.
 *
 * Deckbox is the one major collection site that exposes collections at a
 * public URL with no authentication and no bot challenge — its robots.txt
 * permits crawling everything — so a collection can be imported from a link
 * and refreshed later instead of being re-exported by hand.
 */

import type { CollectionCard } from "./csv";
import {
  DECKBOX_MAX_PAGES,
  parseDeckboxPage,
  parseDeckboxUrl,
  parseOwnerName,
  parsePageCount,
  setUrl,
  setNameVariants,
  type DeckboxRow,
} from "./deckbox-parse";
import { normalizeName } from "./normalize";
import { getSetCodeIndex } from "./scryfall";

export * from "./deckbox-parse";

const USER_AGENT =
  "TCGWhoHasWhat/0.1 (collection comparison for a private playgroup; +https://github.com/Gage77/TCGWhoHasWhat)";
const CONCURRENCY = 4;

export interface DeckboxImport {
  cards: CollectionCard[];
  pagesFetched: number;
  /** Deckbox username from the page title, used to name the owner. */
  suggestedName: string | null;
  /** True when the collection exceeded the page cap and was cut short. */
  truncated: boolean;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Deckbox returned ${response.status} for that collection.`);
  }
  return response.text();
}

/**
 * Fetch an entire public Deckbox collection.
 *
 * Deckbox paginates at a fixed 30 rows and ignores page-size parameters, so a
 * large collection is genuinely hundreds of requests; they run a few at a time
 * rather than all at once to stay a polite client.
 */
export async function fetchDeckboxCollection(input: string): Promise<DeckboxImport> {
  const source = parseDeckboxUrl(input);

  const firstHtml = await fetchPage(setUrl(source.setId, source.tradelistOnly));
  const cards = parseDeckboxPage(firstHtml);
  const suggestedName = parseOwnerName(firstHtml);

  if (cards.length === 0) {
    throw new Error(
      "No cards found at that link. Check the collection is public and the URL points to an inventory.",
    );
  }

  const totalPages = parsePageCount(firstHtml);
  const lastPage = Math.min(totalPages, DECKBOX_MAX_PAGES);

  // Pages 2..lastPage, a few in flight at a time.
  const queue: number[] = [];
  for (let page = 2; page <= lastPage; page++) queue.push(page);

  const pages = new Map<number, DeckboxRow[]>();
  async function worker() {
    for (;;) {
      const page = queue.shift();
      if (page === undefined) return;
      const html = await fetchPage(setUrl(source.setId, source.tradelistOnly, page));
      pages.set(page, parseDeckboxPage(html));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
  );

  for (let page = 2; page <= lastPage; page++) {
    const pageCards = pages.get(page);
    if (pageCards) cards.push(...pageCards);
  }

  return {
    cards: await resolveSetCodes(cards),
    pagesFetched: lastPage,
    suggestedName,
    truncated: totalPages > DECKBOX_MAX_PAGES,
  };
}

/**
 * Turn Deckbox's set names into set codes so each copy can be priced as the
 * exact printing. Unmatched sets keep a null code and fall back to
 * name-only pricing rather than failing the import.
 */
export async function resolveSetCodes(rows: DeckboxRow[]): Promise<CollectionCard[]> {
  const index = await getSetCodeIndex();

  const lookup = (setName: string): string | null => {
    for (const variant of setNameVariants(setName)) {
      const code = index.get(normalizeName(variant));
      if (code) return code;
    }
    return null;
  };

  // The same handful of sets repeat across thousands of rows.
  const cache = new Map<string, string | null>();

  return rows.map(({ setName, ...card }) => {
    if (!setName) return { ...card, setCode: null };
    let code = cache.get(setName);
    if (code === undefined) {
      code = lookup(setName);
      cache.set(setName, code);
    }
    return { ...card, setCode: code };
  });
}
