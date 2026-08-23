/**
 * The facts a filter runs on, projected out of a Scryfall card.
 *
 * Pricing only ever needed a card's identity and its prices, so that is all
 * `ResolvedCard` keeps. Filtering a collection needs the other half — what
 * colour it is, what it costs to cast, what it does — and that half is stable
 * in a way prices are not: a card's type line has never changed overnight.
 * Keeping the two apart is what lets prices expire in twelve hours while
 * everything here is fetched once and kept.
 *
 * The projection is a pure function so the awkward cards can be tested
 * without a network: a double-faced card carries no top-level colours, oracle
 * text or power, only faces that do. It imports nothing at runtime for the
 * same reason every other module the tests reach into does not — `node --test`
 * strips the types and runs the file, with no bundler to resolve extensionless
 * paths for it.
 */

import type { ScryfallCard, ScryfallFace } from "./scryfall";

/** WUBRG. Colours are stored in this order so equal sets compare equal. */
const COLOR_ORDER = "WUBRG";

export interface CardFacts {
  scryfallId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  /** ISO date, for sorting a collection by how new the printing is. */
  releasedAt: string | null;
  rarity: string;
  manaCost: string | null;
  /** Mana value. Scryfall calls this `cmc`; players still say both. */
  cmc: number;
  /** Sorted WUBRG letters — "" for a colourless card, "UW" never "WU". */
  colors: string;
  colorIdentity: string;
  typeLine: string;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  /** JSON array, as Scryfall gives it. */
  keywords: string[];
  /** Format name to legality, e.g. `{ commander: "legal" }`. */
  legalities: Record<string, string>;
  layout: string;
  artist: string | null;
  imageSmall: string | null;
  imageNormal: string | null;
  /** Popularity rank; low is common. Absent for cards nobody plays. */
  edhrecRank: number | null;
  reserved: boolean;
  promo: boolean;
}

/**
 * Fold Scryfall's colour array to sorted WUBRG letters.
 *
 * A string rather than a join table: "contains blue" is then `LIKE '%U%'` and
 * "mono-blue" is `= 'U'`, which is the whole of colour filtering in two
 * comparisons and no extra rows per card.
 */
export function encodeColors(colors: readonly string[] | null | undefined): string {
  if (!colors || colors.length === 0) return "";
  const present = new Set(colors.map((color) => color.toUpperCase()));
  return [...COLOR_ORDER].filter((letter) => present.has(letter)).join("");
}

/** The faces of a card, or an empty list for the ordinary single-faced kind. */
function facesOf(card: ScryfallCard): ScryfallFace[] {
  return card.card_faces ?? [];
}

/**
 * Read a field from the card, falling back to its front face.
 *
 * Transforming and modal double-faced cards put mana cost, power and oracle
 * text on the faces and leave the top level empty, so asking the card
 * directly returns nothing for exactly the cards people most want to filter.
 */
function fromCardOrFrontFace(
  card: ScryfallCard,
  read: (source: ScryfallCard | ScryfallFace) => string | undefined,
): string | null {
  const own = read(card);
  if (own !== undefined && own !== "") return own;

  const front = facesOf(card)[0];
  const face = front ? read(front) : undefined;
  return face !== undefined && face !== "" ? face : null;
}

export function toCardFacts(card: ScryfallCard): CardFacts {
  const faces = facesOf(card);

  // A double-faced card's colours live on its faces; the card is every colour
  // either side of it is. Colour *identity* is always given at the top level,
  // because it is a property of the card rather than of one face.
  const colors = card.colors
    ? encodeColors(card.colors)
    : encodeColors(faces.flatMap((face) => face.colors ?? []));

  // Both halves, separated the way Scryfall writes a split name, so a search
  // for text on the back face still finds the card.
  const oracleText =
    card.oracle_text ??
    (faces.length > 0
      ? faces
          .map((face) => face.oracle_text ?? "")
          .filter(Boolean)
          .join("\n//\n") || null
      : null);

  return {
    scryfallId: card.id,
    name: card.name,
    setCode: card.set,
    setName: card.set_name,
    collectorNumber: card.collector_number,
    releasedAt: card.released_at ?? null,
    rarity: card.rarity ?? "unknown",
    manaCost: fromCardOrFrontFace(card, (source) => source.mana_cost),
    cmc: typeof card.cmc === "number" ? card.cmc : 0,
    colors,
    colorIdentity: encodeColors(card.color_identity),
    typeLine:
      card.type_line ?? faces.map((face) => face.type_line ?? "").filter(Boolean).join(" // "),
    oracleText,
    power: fromCardOrFrontFace(card, (source) => source.power),
    toughness: fromCardOrFrontFace(card, (source) => source.toughness),
    loyalty: fromCardOrFrontFace(card, (source) => source.loyalty),
    keywords: card.keywords ?? [],
    legalities: card.legalities ?? {},
    layout: card.layout ?? "normal",
    artist: card.artist ?? null,
    imageSmall: card.image_uris?.small ?? faces[0]?.image_uris?.small ?? null,
    imageNormal: card.image_uris?.normal ?? faces[0]?.image_uris?.normal ?? null,
    edhrecRank: typeof card.edhrec_rank === "number" ? card.edhrec_rank : null,
    reserved: card.reserved === true,
    promo: card.promo === true,
  };
}
