import { NextResponse } from "next/server";

import { buildTradeReport } from "@/lib/trades";

export const dynamic = "force-dynamic";
// Pricing every matched card can mean several throttled Scryfall calls.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ownerId?: string; tradeableOnly?: boolean };
    if (!body.ownerId) {
      return NextResponse.json({ error: "Choose whose trades to look at." }, { status: 400 });
    }

    return NextResponse.json(
      await buildTradeReport(body.ownerId, { tradeableOnly: body.tradeableOnly }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not work out trades." },
      { status: 400 },
    );
  }
}
