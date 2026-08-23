/**
 * What a file dropped on the page means.
 *
 * Dragging the export straight out of the downloads bar is how people expect
 * to hand a file to a web page, and it saves the two steps — open the form,
 * walk the file dialog back to Downloads — that stand between a fresh export
 * and an up-to-date collection. Everything here is the deciding, kept out of
 * the component so it can be tested without a browser to drag things in.
 *
 * No runtime imports: the tests load this file directly.
 */

/** The part of a `File` any of this depends on. */
export interface NamedFile {
  name: string;
}

/**
 * What a collection export actually arrives as.
 *
 * Matched on the extension rather than the MIME type because the type of a
 * dropped CSV is whatever the operating system last associated with it —
 * commonly `application/vnd.ms-excel`, and just as commonly the empty string.
 */
export const COLLECTION_EXTENSIONS = [".csv", ".tsv", ".txt"];

export type DropResult<T> = { ok: true; file: T } | { ok: false; error: string };

/** Lowercased, including the dot; empty for a name that has no extension. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/**
 * The one file to work with, or why there isn't one.
 *
 * A drop is easy to get wrong in ways the page can see coming — a whole
 * folder's worth selected, an image dragged out of another tab — and saying
 * which of those happened is more use than the form sitting there unchanged
 * and apparently broken.
 */
export function pickDroppedFile<T extends NamedFile>(files: T[]): DropResult<T> {
  if (files.length === 0) {
    return { ok: false, error: "That drop had no file in it — try the file itself." };
  }
  if (files.length > 1) {
    return { ok: false, error: "Drop one collection at a time." };
  }

  const [file] = files;
  if (!COLLECTION_EXTENSIONS.includes(extensionOf(file.name))) {
    return {
      ok: false,
      error: `${file.name} is not a collection export. Those come out as .csv, .tsv or .txt.`,
    };
  }

  return { ok: true, file };
}

/** Lowercased words, so `Hunter_moxfield-2026.csv` is three of them. */
function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

/**
 * Whose collection a file looks like, out of the people already here.
 *
 * Exports are named after the person often enough — `hunter.csv`,
 * `moxfield_hunter_2026-08.csv` — that guessing is worth it, and re-uploading
 * under an existing name is the supported way to update someone. Guessed into
 * the name field rather than acted on: replacing a collection is not something
 * to do because a filename hinted at it, so the answer still has to be looked
 * at and the button still has to be pressed.
 *
 * Only whole words count, and every word of the name has to appear, so
 * `alex.csv` does not land on Alexandra and a shared export named after the
 * playgroup lands on nobody.
 */
export function matchOwnerName(fileName: string, ownerNames: string[]): string | null {
  const stem = fileName.slice(0, fileName.length - extensionOf(fileName).length);
  const inFile = new Set(words(stem));

  let best: string | null = null;
  let bestLength = 0;

  for (const owner of ownerNames) {
    const parts = words(owner);
    if (parts.length === 0 || !parts.every((part) => inFile.has(part))) continue;
    // The most specific name wins, so "Alex Kim" beats a playgroup-mate "Alex"
    // on a file that names them both.
    if (parts.length > bestLength) {
      best = owner;
      bestLength = parts.length;
    }
  }

  return best;
}
