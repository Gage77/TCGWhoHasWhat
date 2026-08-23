/**
 * Scryfall client.
 *
 * Scryfall is the pricing and card-identity source: it aggregates TCGplayer
 * (USD) and Cardmarket (EUR) prices per exact printing and updates daily,
 * which is what makes "what is this worth in a trade" answerable.
 *
 * House rules we honour: identify ourselves with a User-Agent, keep requests
 * at least 100ms apart, and cache aggressively.
 */

import { toCardFacts, type CardFacts } from "./cardFacts";
import { readCache, writeCache } from "./db";
import { normalizeName } from "./normalize";
import { userAgent } from "./userAgent";

const API = "https://api.scryfall.com";
const MIN_REQUEST_GAP_MS = 100;
const BATCH_SIZE = 75; // Scryfall's documented maximum per collection request.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // Prices refresh daily upstream.

export interface CardPrices {
  usd: number | null;
  usdFoil: number | null;
  usdEtched: number | null;
  eur: number | null;
  tix: number | null;
}

export interface ResolvedCard {
  scryfallId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  prices: CardPrices;
  scryfallUri: string;
  imageUri: string | null;
  tcgplayerUri: string | null;
}

/** A request for one specific printing, or for a card by name. */
export type CardIdentifier =
  | { kind: "id"; id: string }
  | { kind: "printing"; setCode: string; collectorNumber: string }
  | { kind: "name"; name: string };

/**
 * The most precise identifier a stored collection row supports.
 *
 * Shared, because search and enrichment must agree: they key the same caches
 * by the result, and a row identified by name in one place and by printing in
 * the other would look up two different cards.
 */
export function identifierFor(row: {
  scryfallId: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  name: string;
}): CardIdentifier {
  if (row.scryfallId) return { kind: "id", id: row.scryfallId };
  if (row.setCode && row.collectorNumber) {
    return { kind: "printing", setCode: row.setCode, collectorNumber: row.collectorNumber };
  }
  return { kind: "name", name: row.name };
}

export function identifierKey(identifier: CardIdentifier): string {
  switch (identifier.kind) {
    case "id":
      return `id:${identifier.id}`;
    case "printing":
      return `set:${identifier.setCode.toLowerCase()}/${identifier.collectorNumber.toLowerCase()}`;
    case "name":
      return `name:${normalizeName(identifier.name)}`;
  }
}

let requestChain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** Serialize all outbound calls with a minimum gap, per Scryfall's guidance. */
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const result = requestChain.then(async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  requestChain = result.catch(() => undefined);
  return result;
}

function toNumber(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * One side of a double-faced or split card.
 *
 * Everything here is also a property of an ordinary card, which is what lets
 * the facts projection read a field off whichever of the two has it.
 */
export interface ScryfallFace {
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  image_uris?: { normal?: string; small?: string };
}

/** The subset of Scryfall's card object this app reads. */
export interface ScryfallCard extends ScryfallFace {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  released_at?: string;
  rarity?: string;
  cmc?: number;
  color_identity?: string[];
  keywords?: string[];
  legalities?: Record<string, string>;
  layout?: string;
  artist?: string;
  edhrec_rank?: number;
  reserved?: boolean;
  promo?: boolean;
  prices?: Record<string, string | null>;
  scryfall_uri?: string;
  card_faces?: ScryfallFace[];
  purchase_uris?: { tcgplayer?: string };
}

function toResolvedCard(card: ScryfallCard): ResolvedCard {
  const prices = card.prices ?? {};
  return {
    scryfallId: card.id,
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    rarity: card.rarity ?? "unknown",
    prices: {
      usd: toNumber(prices.usd),
      usdFoil: toNumber(prices.usd_foil),
      usdEtched: toNumber(prices.usd_etched),
      eur: toNumber(prices.eur),
      tix: toNumber(prices.tix),
    },
    scryfallUri: card.scryfall_uri ?? `https://scryfall.com/card/${card.set}/${card.collector_number}`,
    imageUri:
      card.image_uris?.normal ??
      card.image_uris?.small ??
      card.card_faces?.[0]?.image_uris?.normal ??
      null,
    tcgplayerUri: card.purchase_uris?.tcgplayer ?? null,
  };
}

async function postCollection(identifiers: CardIdentifier[]): Promise<{
  found: ScryfallCard[];
  notFound: CardIdentifier[];
}> {
  const payload = identifiers.map((identifier) => {
    switch (identifier.kind) {
      case "id":
        return { id: identifier.id };
      case "printing":
        return { set: identifier.setCode, collector_number: identifier.collectorNumber };
      case "name":
        return { name: identifier.name };
    }
  });

  const response = await throttle(() =>
    fetch(`${API}/cards/collection`, {
      method: "POST",
      headers: {
        "User-Agent": userAgent(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifiers: payload }),
    }),
  );

  if (!response.ok) {
    throw new Error(`Scryfall responded ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    data?: ScryfallCard[];
    not_found?: Array<Record<string, string>>;
  };

  // Scryfall echoes back the identifiers it could not resolve; map them to
  // our own identifier objects so callers can retry them fuzzily.
  const notFoundKeys = new Set(
    (body.not_found ?? []).map((entry) => {
      if (entry.id) return `id:${entry.id}`;
      if (entry.set) return `set:${entry.set.toLowerCase()}/${(entry.collector_number ?? "").toLowerCase()}`;
      return `name:${normalizeName(entry.name ?? "")}`;
    }),
  );

  return {
    found: body.data ?? [],
    notFound: identifiers.filter((identifier) => notFoundKeys.has(identifierKey(identifier))),
  };
}

const SET_INDEX_KEY = "meta:set-index";
const SET_INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // New sets appear rarely.

/**
 * Map set names to set codes.
 *
 * Deckbox labels printings with the set's full name ("Tempest") while
 * pricing needs its code ("tmp"). Scryfall returns every set in one request,
 * so the whole index is fetched once and cached for a week.
 */
export async function getSetCodeIndex(): Promise<Map<string, string>> {
  const cached = await readCache([SET_INDEX_KEY], SET_INDEX_TTL_MS);
  const raw = cached.get(SET_INDEX_KEY);
  if (raw) {
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  }

  try {
    const response = await throttle(() =>
      fetch(`${API}/sets`, { headers: { "User-Agent": userAgent(), Accept: "application/json" } }),
    );
    if (!response.ok) return new Map();

    const body = (await response.json()) as { data?: Array<{ code: string; name: string }> };
    const index: Record<string, string> = {};
    for (const set of body.data ?? []) {
      index[normalizeName(set.name)] = set.code;
    }

    await writeCache([[SET_INDEX_KEY, JSON.stringify(index)]]);
    return new Map(Object.entries(index));
  } catch {
    // Without the index, imported cards simply fall back to name-only pricing.
    return new Map();
  }
}

/** Last-resort single-card lookup that tolerates typos and partial names. */
async function fuzzyNamed(name: string): Promise<ScryfallCard | null> {
  const response = await throttle(() =>
    fetch(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
    }),
  );
  if (!response.ok) return null;
  return (await response.json()) as ScryfallCard;
}

/** One identifier per key; the same printing is usually wanted several times. */
function dedupe(identifiers: CardIdentifier[]): Map<string, CardIdentifier> {
  const byKey = new Map<string, CardIdentifier>();
  for (const identifier of identifiers) byKey.set(identifierKey(identifier), identifier);
  return byKey;
}

/**
 * Ask Scryfall for whatever it can resolve, in batches, and match the results
 * back to the identifiers that asked for them.
 *
 * This is deliberately the raw card rather than either projection: prices and
 * facts come out of the same response, so whichever path runs first can hand
 * the other one its answer instead of fetching the collection twice.
 */
async function fetchCards(
  identifiers: CardIdentifier[],
  options: { fuzzyFallback?: boolean } = {},
): Promise<{ cards: Map<string, ScryfallCard>; misses: string[] }> {
  const cards = new Map<string, ScryfallCard>();
  const misses: string[] = [];

  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const batch = identifiers.slice(i, i + BATCH_SIZE);
    let found: ScryfallCard[] = [];
    let notFound: CardIdentifier[] = [];

    try {
      ({ found, notFound } = await postCollection(batch));
    } catch {
      // A failed batch should not sink the whole request; those cards just
      // come back unresolved. Not recorded as misses either — a network blip
      // is not Scryfall saying the card does not exist.
      continue;
    }

    // Match results back to the identifier that requested them. Scryfall
    // returns cards in request order for the ones it found, but names may be
    // normalized differently, so match on the card's own fields where we can.
    const unmatched = [...found];
    for (const identifier of batch) {
      let index = -1;

      if (identifier.kind === "id") {
        index = unmatched.findIndex((card) => card.id === identifier.id);
      } else if (identifier.kind === "printing") {
        index = unmatched.findIndex(
          (card) =>
            card.set.toLowerCase() === identifier.setCode.toLowerCase() &&
            card.collector_number.toLowerCase() === identifier.collectorNumber.toLowerCase(),
        );
      } else {
        const wanted = normalizeName(identifier.name);
        index = unmatched.findIndex((card) => {
          const cardName = normalizeName(card.name);
          return cardName === wanted || cardName.split("//")[0].trim() === wanted;
        });
      }

      if (index >= 0) {
        cards.set(identifierKey(identifier), unmatched[index]);
        unmatched.splice(index, 1);
      }
    }

    for (const identifier of notFound) {
      if (options.fuzzyFallback && identifier.kind === "name") {
        try {
          const card = await fuzzyNamed(identifier.name);
          if (card) {
            cards.set(identifierKey(identifier), card);
            continue;
          }
        } catch {
          // fall through to recording a miss
        }
      }
      misses.push(identifierKey(identifier));
    }
  }

  return { cards, misses };
}

/**
 * Resolve identifiers to cards with prices, hitting the cache first and
 * batching whatever is left. Unresolvable identifiers are simply absent from
 * the returned map.
 */
export async function resolveCards(
  identifiers: CardIdentifier[],
  options: { fuzzyFallback?: boolean } = {},
): Promise<Map<string, ResolvedCard>> {
  const resolved = new Map<string, ResolvedCard>();
  const byKey = dedupe(identifiers);

  const cached = await readCache([...byKey.keys()], CACHE_TTL_MS);
  const pending: CardIdentifier[] = [];

  for (const [key, identifier] of byKey) {
    if (cached.has(key)) {
      const json = cached.get(key);
      // A cached null records a confirmed miss; do not re-ask Scryfall.
      if (json) resolved.set(key, JSON.parse(json) as ResolvedCard);
    } else {
      pending.push(identifier);
    }
  }

  const { cards, misses } = await fetchCards(pending, options);
  const toCache: Array<[string, string | null]> = [];

  for (const [key, card] of cards) {
    const resolvedCard = toResolvedCard(card);
    resolved.set(key, resolvedCard);
    toCache.push([key, JSON.stringify(resolvedCard)]);
  }
  for (const key of misses) {
    toCache.push([key, null]);
  }

  await writeCache(toCache);
  return resolved;
}

/**
 * Fetch the filterable half of a card — colours, types, mana value, text.
 *
 * Always goes to Scryfall: unlike prices there is no short-lived cache to
 * check, because the caller (`enrichOwner`) has already asked the database
 * which printings it is missing facts for. Prices ride along free, since the
 * response carries them and the alternative is fetching the same collection
 * again the first time somebody searches.
 */
export async function fetchCardFacts(
  identifiers: CardIdentifier[],
  options: { fuzzyFallback?: boolean } = {},
): Promise<{ facts: Map<string, CardFacts>; misses: string[] }> {
  const byKey = dedupe(identifiers);
  const { cards, misses } = await fetchCards([...byKey.values()], options);

  const facts = new Map<string, CardFacts>();
  const prices: Array<[string, string | null]> = [];

  for (const [key, card] of cards) {
    facts.set(key, toCardFacts(card));
    prices.push([key, JSON.stringify(toResolvedCard(card))]);
  }

  await writeCache(prices);
  return { facts, misses };
}

/**
 * The price that applies to the finish an owner actually has.
 *
 * Some printings only exist in one finish — promos are often foil-only and
 * carry no `usd` at all — while collection exports still record them as
 * "normal". Rather than show nothing, fall back to whatever price the
 * printing does have and mark it approximate.
 */
export function priceForFinish(
  card: ResolvedCard,
  finish: string,
): { price: number | null; approximate: boolean } {
  const { usd, usdFoil, usdEtched } = card.prices;
  const exact = finish === "foil" ? usdFoil : finish === "etched" ? usdEtched : usd;
  if (exact !== null) return { price: exact, approximate: false };

  const fallback = usd ?? usdFoil ?? usdEtched ?? null;
  return { price: fallback, approximate: fallback !== null };
}
