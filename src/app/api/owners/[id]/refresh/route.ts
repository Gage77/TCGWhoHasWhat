import { NextResponse } from "next/server";

import { getOwner, replaceCollection } from "@/lib/db";
import { fetchDeckboxCollection } from "@/lib/deckbox";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Re-fetch a link-imported collection from its stored source URL. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const owner = await getOwner(id);

    if (!owner) {
      return NextResponse.json({ error: "That collection no longer exists." }, { status: 404 });
    }
    if (!owner.sourceUrl) {
      return NextResponse.json(
        { error: "That collection was uploaded as a file, so there is nothing to re-fetch." },
        { status: 400 },
      );
    }

    const result = await fetchDeckboxCollection(owner.sourceUrl);
    if (result.cards.length === 0) {
      return NextResponse.json({ error: "That collection now looks empty." }, { status: 400 });
    }

    const { owner: updated, diff } = await replaceCollection(owner.name, result.cards, {
      sourceUrl: owner.sourceUrl,
      tracker: owner.tracker,
    });
    return NextResponse.json({ owner: updated, diff, pagesFetched: result.pagesFetched });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not refresh that collection." },
      { status: 400 },
    );
  }
}
