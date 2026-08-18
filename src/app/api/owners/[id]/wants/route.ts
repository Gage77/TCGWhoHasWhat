import { NextResponse } from "next/server";

import {
  addToWantList,
  createWantList,
  deleteWantList,
  getOwner,
  getWantList,
  listWantLists,
  renameWantList,
  replaceWantList,
  type WantInput,
} from "@/lib/db";
import { parseWantList } from "@/lib/parseList";

export const dynamic = "force-dynamic";

/** Every want list this person has, each with its cards. */
export async function GET(_request: Request, ctx: RouteContext<"/api/owners/[id]/wants">) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json({ lists: await listWantLists(id) });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

/**
 * Write to a want list.
 *
 * With no `listId` a new list is created, which is what naming a list in the
 * UI does. With one, `mode` decides between replacing the list (the paste
 * editor) and merging into it (sending a deck's gaps over from a search).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/owners/[id]/wants">) {
  try {
    const { id } = await ctx.params;
    const owner = await getOwner(id);
    if (!owner) {
      return NextResponse.json({ error: "That person is no longer in the group." }, { status: 404 });
    }

    const body = (await request.json()) as {
      listId?: string;
      name?: string;
      list?: string;
      cards?: WantInput[];
      mode?: "replace" | "add";
    };

    // A pasted list is the common case; `cards` lets a search hand over rows
    // it has already parsed and resolved.
    const wants: WantInput[] = Array.isArray(body.cards)
      ? body.cards
          .filter((card) => typeof card?.name === "string" && card.name.trim() !== "")
          .map((card) => ({
            name: card.name.trim(),
            quantity: Math.max(1, Number(card.quantity) || 1),
            priority: Number(card.priority) || 0,
            setCode: card.setCode ?? null,
            collectorNumber: card.collectorNumber ?? null,
          }))
      : parseWantList(typeof body.list === "string" ? body.list : "");

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

    if (body.mode === "add") {
      const result = await addToWantList(listId, wants);
      if (!result) {
        return NextResponse.json({ error: "That want list no longer exists." }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    const list = await replaceWantList(listId, wants);
    if (!list) {
      return NextResponse.json({ error: "That want list no longer exists." }, { status: 404 });
    }
    return NextResponse.json({ list, added: list.cards.length, updated: 0 });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

/** Rename a list. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/owners/[id]/wants">) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as { listId?: string; name?: string };
    if (!body.listId || !body.name?.trim()) {
      return NextResponse.json({ error: "Give the list a name." }, { status: 400 });
    }

    const list = await getWantList(body.listId);
    if (!list || list.ownerId !== id) {
      return NextResponse.json({ error: "That want list no longer exists." }, { status: 404 });
    }

    await renameWantList(body.listId, body.name);
    return NextResponse.json({ list: await getWantList(body.listId) });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/owners/[id]/wants">) {
  try {
    const { id } = await ctx.params;
    const listId = new URL(request.url).searchParams.get("listId");
    if (!listId) {
      return NextResponse.json({ error: "Which list?" }, { status: 400 });
    }

    const list = await getWantList(listId);
    if (!list || list.ownerId !== id) {
      return NextResponse.json({ error: "That want list no longer exists." }, { status: 404 });
    }

    await deleteWantList(listId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
