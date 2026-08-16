import { NextResponse } from "next/server";

import { runSearch } from "@/lib/search";

export const dynamic = "force-dynamic";
// Large want lists mean several throttled Scryfall round-trips.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { list?: string; deckOwnerId?: string };
    const list = typeof body.list === "string" ? body.list : "";

    if (!list.trim()) {
      return NextResponse.json({ error: "Paste some card names first." }, { status: 400 });
    }

    return NextResponse.json(await runSearch(list, { deckOwnerId: body.deckOwnerId }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 },
    );
  }
}
