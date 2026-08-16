/**
 * Card-name normalization.
 *
 * Collection exports and hand-typed want lists disagree about punctuation,
 * accents and double-faced card naming. Everything is funnelled through
 * `normalizeName` so "Lim-Dûl's Vault", "lim duls vault" and "Lim-Dul's Vault"
 * all collapse to the same lookup key.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Ligatures and lookalike punctuation that NFD alone will not fold. */
const CHAR_FOLDS: Array<[RegExp, string]> = [
  [/[Ææ]/g, "ae"],
  [/[Œœ]/g, "oe"],
  [/[Øø]/g, "o"],
  [/[ß]/g, "ss"],
  [/[‘’ʼ′]/g, "'"],
  [/[“”]/g, '"'],
  [/[–—−]/g, "-"],
];

/**
 * Fold a card name to its lookup key: lowercase, unaccented, punctuation-free.
 * The `//` face separator is preserved so split/DFC names stay decomposable.
 */
export function normalizeName(raw: string): string {
  let s = raw.normalize("NFD").replace(COMBINING_MARKS, "");
  for (const [pattern, replacement] of CHAR_FOLDS) {
    s = s.replace(pattern, replacement);
  }
  return s
    .toLowerCase()
    .replace(/\/\//g, " // ")
    .replace(/[^a-z0-9/ ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every key a card should be findable under. A split, adventure or
 * double-faced card is indexed under its full name *and* each face, so a
 * want list asking for "Brazen Borrower" still matches a collection row
 * exported as "Brazen Borrower // Petty Theft".
 */
export function nameKeys(raw: string): string[] {
  const full = normalizeName(raw);
  const keys = new Set<string>();
  if (full) keys.add(full);
  if (full.includes("//")) {
    for (const face of full.split("//")) {
      const trimmed = face.trim();
      if (trimmed) keys.add(trimmed);
    }
  }
  return [...keys];
}

/** The primary (front-face) key, used when a single key must be chosen. */
export function primaryKey(raw: string): string {
  const full = normalizeName(raw);
  return full.includes("//") ? full.split("//")[0].trim() : full;
}
