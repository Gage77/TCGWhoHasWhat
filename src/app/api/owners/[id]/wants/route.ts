import { NextResponse } from "next/server";

import { getOwner, listWants, replaceWantList } from "@/lib/db";
import { parseWantList } from "@/lib/parseList";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ wants: await listWants(id) });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

/** Replace a person's saved want list from a pasted list. */
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const owner = await getOwner(id);
    if (!owner) {
      return NextResponse.json({ error: "That person is no longer in the group." }, { status: 404 });
    }

    const body = (await request.json()) as { list?: string };
    const parsed = parseWantList(typeof body.list === "string" ? body.list : "");

    const wants = await replaceWantList(id, parsed);
    return NextResponse.json({ wants });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
