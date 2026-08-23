"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { WantList } from "@/lib/db";
import type { WantDraft } from "@/lib/wantDrafts";

export const NEW_LIST = "__new__";

export interface WantTargetState {
  /** The list cards are being added to, or NEW_LIST. */
  target: string;
  /** Add one card. Resolves to a message worth showing, or throws. */
  addCard: (card: WantDraft) => Promise<string>;
  /** Add everything the current filter matches, server-side. */
  addFiltered: () => Promise<string>;
  /** True while either add is in flight. */
  busy: boolean;
  lists: WantList[] | null;
  setTarget: (id: string) => void;
  newListName: string;
  setNewListName: (name: string) => void;
  reload: () => Promise<void>;
}

/**
 * Where wants go, and how they get there.
 *
 * A hook rather than a component because two very different controls share it
 * — a picker in the toolbar and a button on every card — and they have to
 * agree about which list is being filled.
 */
export function useWantTarget(meId: string, collectionId: string, query: string): WantTargetState {
  const [lists, setLists] = useState<WantList[] | null>(null);
  const [target, setTarget] = useState(NEW_LIST);
  const [newListName, setNewListName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!meId) return;
    const data = await fetch(`/api/owners/${meId}/wants`).then((response) => response.json());
    const loaded: WantList[] = data.lists ?? [];
    setLists(loaded);
    // Default to the list they already have, since most people keep one or two.
    setTarget((current) => (current === NEW_LIST ? (loaded[0]?.id ?? NEW_LIST) : current));
  }, [meId]);

  useEffect(() => {
    let cancelled = false;
    // Nobody to load lists for. Left as it was rather than cleared, because
    // settling state from an effect body is a cascading render — and the
    // caller does not render any of this without an identity anyway.
    if (!meId) return;

    fetch(`/api/owners/${meId}/wants`)
      .then((response) => response.json())
      .then((data: { lists?: WantList[] }) => {
        if (cancelled) return;
        const loaded = data.lists ?? [];
        setLists(loaded);
        setTarget(loaded[0]?.id ?? NEW_LIST);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });

    return () => {
      cancelled = true;
    };
  }, [meId]);

  /** The list to write to, creating one first if that is what was chosen. */
  function destination(): { listId?: string; name?: string } {
    return target === NEW_LIST
      ? { name: newListName.trim() || `Cards I want` }
      : { listId: target };
  }

  async function post(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...destination(), ...body }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not save that.");
    return data;
  }

  async function addCard(card: WantDraft): Promise<string> {
    setBusy(true);
    try {
      const data = await post(`/api/owners/${meId}/wants`, { cards: [card], mode: "add" });
      const list = (data.list as { name?: string } | undefined)?.name ?? "your want list";
      const added = Number(data.added ?? 0);
      const updated = Number(data.updated ?? 0);

      await reload();
      if (added === 0 && updated === 0) return `Already on ${list}.`;
      return `Added to ${list}.`;
    } finally {
      setBusy(false);
    }
  }

  async function addFiltered(): Promise<string> {
    setBusy(true);
    try {
      const data = await post(`/api/owners/${meId}/wants/from-collection`, {
        collectionId,
        q: query,
      });

      const list = (data.list as { name?: string } | undefined)?.name ?? "your want list";
      const added = Number(data.added ?? 0);
      const updated = Number(data.updated ?? 0);
      const omitted = Number(data.omitted ?? 0);

      await reload();

      const parts: string[] = [];
      if (added > 0) parts.push(`${added} added`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (parts.length === 0) parts.push("nothing new");

      // Said plainly, because a list holding a fraction of what was asked for
      // is the kind of thing people find out about much later otherwise.
      const tail = omitted > 0 ? ` ${omitted} more matched than one go can add.` : "";
      return `${list}: ${parts.join(", ")}.${tail}`;
    } finally {
      setBusy(false);
    }
  }

  return {
    target,
    setTarget,
    lists,
    busy,
    addCard,
    addFiltered,
    newListName,
    setNewListName,
    reload,
  };
}

/** The picker, plus the button that takes the whole filtered set. */
export function WantTargetBar({
  state,
  matching,
  filtered,
  status,
  onAddFiltered,
}: {
  state: WantTargetState;
  /** How many rows the filter matched, for the button's wording. */
  matching: number;
  /** False when nothing is filtered, which changes what the button means. */
  filtered: boolean;
  status: { kind: "ok" | "error"; text: string } | null;
  onAddFiltered: () => void;
}) {
  if (state.lists === null) return null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">Wants go to</span>

        <select
          value={state.target}
          onChange={(event) => state.setTarget(event.target.value)}
          aria-label="Want list to add to"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 sm:py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {state.lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name} ({list.cards.length})
            </option>
          ))}
          <option value={NEW_LIST}>New list…</option>
        </select>

        {state.target === NEW_LIST && (
          <input
            value={state.newListName}
            onChange={(event) => state.setNewListName(event.target.value)}
            placeholder="e.g. Atraxa upgrades"
            aria-label="New want list name"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 sm:w-auto sm:py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          />
        )}

        <button
          type="button"
          onClick={onAddFiltered}
          disabled={state.busy || matching === 0}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:ml-auto sm:w-auto sm:py-1.5"
        >
          {state.busy
            ? "Saving…"
            : filtered
              ? `Add all ${matching.toLocaleString()} matching`
              : `Add all ${matching.toLocaleString()} cards`}
        </button>
      </div>

      {status && (
        <p
          className={`mt-2 text-sm ${
            status.kind === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}

/** Shown instead of the bar when there is nobody to save wants for. */
export function NoIdentityNote({ browsingOwn }: { browsingOwn: boolean }) {
  if (browsingOwn) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        This is your own collection, so there is nothing here to want.
      </p>
    );
  }

  return (
    <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      <Link href="/" className="font-medium underline underline-offset-2">
        Tell the app who you are
      </Link>{" "}
      and you can send cards from here straight to a want list.
    </p>
  );
}
