import { NextResponse } from "next/server";

import { parseCollectionCsv, type CollectionCard } from "@/lib/csv";
import { listOwners, replaceCollection } from "@/lib/db";
import { fetchDeckboxCollection } from "@/lib/deckbox";

export const dynamic = "force-dynamic";
// A large Deckbox collection is hundreds of paginated requests.
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ owners: await listOwners() });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

/**
 * Upload (or replace) one person's collection, from either a CSV export or a
 * public Deckbox collection link.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const file = form.get("file");
    const url = String(form.get("url") ?? "").trim();

    let cards: CollectionCard[];
    let ownerName = name;
    let sourceUrl: string | null = null;
    const details: Record<string, unknown> = {};

    if (url) {
      const result = await fetchDeckboxCollection(url);
      cards = result.cards;
      sourceUrl = url;
      // Deckbox knows whose collection it is, so a name is optional here.
      ownerName = name || result.suggestedName || "";
      details.pagesFetched = result.pagesFetched;
      details.source = "deckbox";
      if (result.truncated) {
        details.warning = "That collection is very large and only the first 30,000 cards were imported.";
      }
    } else if (file instanceof File && file.size > 0) {
      const parsed = parseCollectionCsv(await file.text());
      cards = parsed.cards;
      details.skipped = parsed.skipped;
      details.matchedColumns = parsed.matchedColumns;
      details.source = "csv";
    } else {
      return NextResponse.json(
        { error: "Attach a collection CSV or paste a Deckbox link." },
        { status: 400 },
      );
    }

    if (!ownerName) {
      return NextResponse.json({ error: "Whose collection is this? Add a name." }, { status: 400 });
    }
    if (cards.length === 0) {
      return NextResponse.json(
        { error: "No cards found — is that really a collection?" },
        { status: 400 },
      );
    }

    const owner = await replaceCollection(ownerName, cards, sourceUrl);
    return NextResponse.json({ owner, ...details });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
