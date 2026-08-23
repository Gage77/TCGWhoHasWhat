/**
 * Working out what the cards in a collection actually are.
 *
 * An import knows names, set codes and quantities — everything the exporting
 * tracker bothered to write down. It does not know that Abhorrent Oculus is a
 * blue creature costing three, and no filter can run until something does.
 *
 * This is the step that finds out. It runs after an upload rather than during
 * it, because the upload has already told the user what changed and there is
 * no reason to make them watch a progress bar for cards they just gave us.
 * Whatever it does not finish, the viewer asks for again when someone opens
 * the collection — so this never has to succeed completely, only eventually.
 */

import {
  factsProgress,
  linkFacts,
  linkKnownFacts,
  listPrintingsNeedingFacts,
  writeCardFacts,
  type CollectionPrinting,
} from "./db";
import { fetchCardFacts, identifierFor, identifierKey } from "./scryfall";

/**
 * Printings per pass.
 *
 * Ten Scryfall requests' worth. Small enough that a run cut short by a
 * deadline has still written most of what it fetched, large enough that the
 * bookkeeping between passes is not the expensive part.
 */
const PASS_SIZE = 750;

/** Leaves room for the enrichment to finish tidily inside a 300s route. */
const DEFAULT_BUDGET_MS = 240_000;

export interface EnrichmentResult {
  /** Rows matched to facts already stored, costing no Scryfall traffic. */
  linkedLocally: number;
  /** Printings this run tried to identify. */
  attempted: number;
  /** Printings Scryfall recognised, whose facts are now stored. */
  identified: number;
  /** Printings Scryfall had never heard of. Usually a typo in an export. */
  unrecognized: number;
  /** True when the budget ran out with printings still unidentified. */
  incomplete: boolean;
}

/**
 * Identify as much of a collection as the time budget allows.
 *
 * Facts are written pass by pass rather than all at the end: a collection
 * large enough to run out of budget is exactly the one where throwing away
 * four minutes of fetching would hurt, and each pass that lands is a pass the
 * next run does not repeat.
 */
export async function enrichOwner(
  ownerId: string,
  options: { budgetMs?: number } = {},
): Promise<EnrichmentResult> {
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);

  // Cheapest first: a refresh usually re-imports the same printings, and
  // those are already known.
  const linkedLocally = await linkKnownFacts(ownerId);
  const pending = await listPrintingsNeedingFacts(ownerId);

  const result: EnrichmentResult = {
    linkedLocally,
    attempted: 0,
    identified: 0,
    unrecognized: 0,
    incomplete: false,
  };

  for (let i = 0; i < pending.length; i += PASS_SIZE) {
    if (Date.now() >= deadline) {
      result.incomplete = true;
      break;
    }

    const pass = pending.slice(i, i + PASS_SIZE);
    result.attempted += pass.length;

    // Several rows can share an identifier — the same card recorded once with
    // its collector number and once without — so keep every printing that
    // asked, not just the last one, or some rows are left unlinked.
    const byKey = new Map<string, CollectionPrinting[]>();
    for (const printing of pass) {
      const key = identifierKey(identifierFor(printing));
      const existing = byKey.get(key);
      if (existing) existing.push(printing);
      else byKey.set(key, [printing]);
    }

    const { facts, misses } = await fetchCardFacts(
      pass.map((printing) => identifierFor(printing)),
    );

    await writeCardFacts([...facts.values()]);

    const links: Array<{ printing: CollectionPrinting; factsId: string }> = [];
    for (const [key, card] of facts) {
      for (const printing of byKey.get(key) ?? []) {
        links.push({ printing, factsId: card.scryfallId });
      }
    }
    await linkFacts(ownerId, links);

    result.identified += links.length;
    result.unrecognized += misses.reduce(
      (sum, key) => sum + (byKey.get(key)?.length ?? 0),
      0,
    );
  }

  return result;
}

/**
 * Identify a collection, but only if something still needs it.
 *
 * The cheap read that makes this safe to call on every view of a collection:
 * a fully identified one costs a single count query and no Scryfall traffic.
 */
export async function enrichIfNeeded(
  ownerId: string,
  options: { budgetMs?: number } = {},
): Promise<EnrichmentResult | null> {
  const { total, identified } = await factsProgress(ownerId);
  if (total === 0 || identified >= total) return null;
  return enrichOwner(ownerId, options);
}
