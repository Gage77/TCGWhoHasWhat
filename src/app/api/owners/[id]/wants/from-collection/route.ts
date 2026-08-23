import { NextResponse } from "next/server";

import { browseCollection } from "@/lib/browse";
import { parseQuery } from "@/lib/cardQuery";
import { addToWantList, createWantList, getOwner, getWantList } from "@/lib/db";
import { BULK_LIMIT, collectionToWants } from "@/lib/wantDrafts";

export const dynamic = "force-dynamic";

/**
 * Put everything a filter matched onto a want list.
 *
 * The filter is re-run here rather than the browser sending up the cards it is
 * showing: it is only showing the first sixty, and shipping several hundred
 * card objects up so the server can read their names off would be a strange
 * way to spend a request.
 *
 * `id` is whose want list — the person browsing. `collectionId` is whose cards
 * are being looked at. They are usually different people, which is the whole
 * point.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/owners/[id]/wants/from-collection">,
) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      collectionId?: string;
      q?: string;
      listId?: string;
      name?: string;
    };

    const [me, collection] = await Promise.all([
      getOwner(id),
      body.collectionId ? getOwner(body.collectionId) : Promise.resolve(null),
    ]);

    if (!me) {
      return NextResponse.json({ error: "That person is no longer in the group." }, { status: 404 });
    }
    if (!collection) {
      return NextResponse.json({ error: "That collection no longer exists." }, { status: 404 });
    }

    const { node } = parseQuery(body.q ?? "");
    const page = await browseCollection(collection.id, {
      filter: node,
      // One more than the cap, so the count of what was left out is right
      // without reading the whole collection back.
      limit: BULK_LIMIT + 1,
    });

    const { wants, distinct, omitted } = collectionToWants(page.cards);
    if (wants.length === 0) {
      return NextResponse.json(
        { error: "That filter matches nothing to add." },
        { status: 400 },
      );
    }

    let listId = body.listId;
    if (!listId) {
      const created = await createWantList(id, body.name ?? "");
      listId = created.id;
    } else {
      const existing = await getWantList(listId);
      if (!existing || existing.ownerId !== id) {
        return NextResponse.json({ error: "That want list no longer exists." }, { status: 404 });
      }
    }

    const result = await addToWantList(listId, wants);
    if (!result) {
      return NextResponse.json({ error: "That want list no longer exists." }, { status: 404 });
    }

    return NextResponse.json({
      ...result,
      distinct,
      // Reported rather than swallowed: a want list holding a third of what
      // was asked for should say so at the time.
      omitted,
      // The filter can match more rows than the browse page could return.
      matchedRows: page.total,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add those cards." },
      { status: 400 },
    );
  }
}
