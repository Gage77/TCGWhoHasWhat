import { NextResponse } from "next/server";

import { parseCollectionCsv } from "@/lib/csv";
import { listOwners, replaceCollection } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ owners: await listOwners() });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

/** Upload (or replace) one person's collection from a CSV export. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const file = form.get("file");

    if (!name) {
      return NextResponse.json({ error: "Whose collection is this? Add a name." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Attach a collection CSV file." }, { status: 400 });
    }

    const { cards, skipped, matchedColumns } = parseCollectionCsv(await file.text());
    if (cards.length === 0) {
      return NextResponse.json(
        { error: "No cards found in that file — is it a collection export?" },
        { status: 400 },
      );
    }

    const owner = await replaceCollection(name, cards);
    return NextResponse.json({ owner, skipped, matchedColumns });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
