import { NextResponse, after } from "next/server";

import { browseCollection, collectionFacets } from "@/lib/browse";
import { parseQuery } from "@/lib/cardQuery";
import { isSortKey } from "@/lib/cardQuerySql";
import { factsProgress, getOwner } from "@/lib/db";
import { enrichIfNeeded } from "@/lib/enrich";

export const dynamic = "force-dynamic";
// Identifying a large collection happens behind the response, but it is this
// route's budget that it spends.
export const maxDuration = 300;

/**
 * One person's collection, filtered.
 *
 * Answers with whatever is known right now rather than waiting for the rest —
 * a collection uploaded before any of this existed has no facts at all, and
 * making someone stare at a spinner for four minutes before seeing their own
 * cards would be a strange way to introduce a card browser. The identification
 * is kicked off behind the response and the counts come back with it, so the
 * page can say what it is still working out and ask again shortly.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const owner = await getOwner(id);
    if (!owner) {
      return NextResponse.json({ error: "That collection no longer exists." }, { status: 404 });
    }

    const url = new URL(request.url);
    const sort = url.searchParams.get("sort") ?? "name";
    const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "60", 10);

    // Both halves of the filter arrive as query text: the controls build a
    // query string too, so there is only ever one thing to parse.
    const { node, warnings } = parseQuery(url.searchParams.get("q") ?? "");

    const [page, facets, progress] = await Promise.all([
      browseCollection(id, {
        filter: node,
        sort: isSortKey(sort) ? sort : "name",
        offset: Number.isFinite(offset) ? offset : 0,
        limit: Number.isFinite(limit) ? limit : 60,
      }),
      // Only worth computing for the first page; later ones reuse what the
      // page already has.
      offset > 0 ? Promise.resolve(null) : collectionFacets(id),
      factsProgress(id),
    ]);

    after(async () => {
      try {
        await enrichIfNeeded(id);
      } catch {
        // Identification is a convenience. A collection that has none still
        // lists, and still filters on its own names, sets and quantities.
      }
    });

    return NextResponse.json({
      owner,
      ...page,
      facets,
      warnings,
      identifying: {
        total: progress.total,
        identified: progress.identified,
        remaining: progress.total - progress.identified,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read that collection." },
      { status: 500 },
    );
  }
}
