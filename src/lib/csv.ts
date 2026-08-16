/**
 * Collection CSV ingest.
 *
 * Moxfield is the primary target, but friends drift between trackers, so
 * columns are matched by alias rather than by fixed position. Anything that
 * exports Name + Set + Collector Number (Moxfield, ManaBox, Deckbox,
 * Archidekt, Helvault) lands correctly.
 */

export type Finish = "normal" | "foil" | "etched";

export interface CollectionCard {
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  /** Copies the owner has flagged as available to trade. */
  tradelistQuantity: number;
  finish: Finish;
  condition: string | null;
  language: string | null;
  /** Present in some exports; the most precise printing identifier available. */
  scryfallId: string | null;
}

export interface ParseResult {
  cards: CollectionCard[];
  /** Rows that had no usable card name, reported back to the uploader. */
  skipped: number;
  /** Column headers we recognised, for the upload confirmation message. */
  matchedColumns: string[];
}

/** RFC 4180 parser: handles quoted fields, embedded delimiters and "" escapes. */
export function parseDelimited(input: string, delimiter: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Pick the delimiter by counting candidates in the header line. */
function detectDelimiter(text: string): string {
  const header = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const counts = [",", "\t", ";"].map((d) => ({
    d,
    n: header.split(d).length - 1,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

const FIELD_ALIASES: Record<keyof CollectionCard, string[]> = {
  name: ["name", "card name", "cardname", "card"],
  setCode: ["edition", "set code", "setcode", "set", "edition code", "set id"],
  collectorNumber: [
    "collector number",
    "collectornumber",
    "card number",
    "cardnumber",
    "collector no",
    "number",
  ],
  quantity: ["count", "quantity", "qty", "amount", "have", "total qty"],
  tradelistQuantity: [
    "tradelist count",
    "tradelist quantity",
    "tradelist",
    "trade count",
    "for trade",
    "tradeable",
  ],
  finish: ["foil", "finish", "printing", "foiling", "is foil"],
  condition: ["condition", "cond"],
  language: ["language", "lang"],
  scryfallId: ["scryfall id", "scryfallid", "scryfall"],
};

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Map each wanted field to its column index, longest alias winning ties. */
function mapColumns(headers: string[]): Partial<Record<keyof CollectionCard, number>> {
  const normalized = headers.map(normalizeHeader);
  const mapping: Partial<Record<keyof CollectionCard, number>> = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [keyof CollectionCard, string[]]
  >) {
    let bestIndex = -1;
    let bestAliasLength = -1;
    normalized.forEach((header, index) => {
      for (const alias of aliases) {
        if (header === alias && alias.length > bestAliasLength) {
          bestIndex = index;
          bestAliasLength = alias.length;
        }
      }
    });
    if (bestIndex >= 0) mapping[field] = bestIndex;
  }

  return mapping;
}

function parseFinish(value: string): Finish {
  const s = value.trim().toLowerCase();
  if (!s || ["normal", "nonfoil", "non foil", "false", "0", "no", "none"].includes(s)) {
    return "normal";
  }
  if (s.includes("etched")) return "etched";
  if (s.includes("foil") || ["true", "1", "yes"].includes(s)) return "foil";
  return "normal";
}

function parseCount(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function cleanCell(value: string | undefined): string | null {
  const s = value?.trim();
  return s ? s : null;
}

/**
 * Parse a collection export into normalized rows. Throws only when the file
 * has no recognisable card-name column, which is the one error the uploader
 * genuinely needs to act on.
 */
export function parseCollectionCsv(text: string): ParseResult {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) {
    throw new Error("The file is empty.");
  }

  const headers = rows[0];
  const columns = mapColumns(headers);
  if (columns.name === undefined) {
    throw new Error(
      `No card-name column found. Expected a "Name" header, but saw: ${headers
        .slice(0, 8)
        .join(", ")}`,
    );
  }

  const cards: CollectionCard[] = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const name = cleanCell(row[columns.name]);
    if (!name) {
      skipped++;
      continue;
    }

    const quantity = parseCount(
      columns.quantity !== undefined ? row[columns.quantity] : undefined,
      1,
    );
    if (quantity === 0) {
      skipped++;
      continue;
    }

    // Trackers without a tradelist concept are treated as "all tradeable",
    // which matches how people actually talk about their binders.
    const tradelistQuantity =
      columns.tradelistQuantity !== undefined
        ? Math.min(parseCount(row[columns.tradelistQuantity], 0), quantity)
        : quantity;

    cards.push({
      name,
      setCode: cleanCell(columns.setCode !== undefined ? row[columns.setCode] : undefined)?.toLowerCase() ?? null,
      collectorNumber: cleanCell(
        columns.collectorNumber !== undefined ? row[columns.collectorNumber] : undefined,
      ),
      quantity,
      tradelistQuantity,
      finish: parseFinish(columns.finish !== undefined ? (row[columns.finish] ?? "") : ""),
      condition: cleanCell(columns.condition !== undefined ? row[columns.condition] : undefined),
      language: cleanCell(columns.language !== undefined ? row[columns.language] : undefined),
      scryfallId: cleanCell(columns.scryfallId !== undefined ? row[columns.scryfallId] : undefined),
    });
  }

  const matchedColumns = (Object.keys(columns) as Array<keyof CollectionCard>)
    .map((field) => headers[columns[field]!])
    .filter(Boolean);

  return { cards, skipped, matchedColumns };
}
