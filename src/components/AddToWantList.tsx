"use client";

import { useEffect, useState } from "react";

import type { WantList } from "@/lib/db";

/** A card on its way onto a list. Mirrors the API's `cards` payload. */
export interface WantDraft {
  name: string;
  quantity: number;
  priority?: number;
  setCode?: string | null;
  collectorNumber?: string | null;
}

interface Props {
  ownerId: string;
  cards: WantDraft[];
  /** Copy for the button, e.g. "Add the 12 cards you're missing". */
  label: string;
  onChanged: () => void;
}

const NEW_LIST = "__new__";

/** Say what actually happened, without opening on a zero. */
function summarize(listName: string, added: number, updated: number, already: number): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (updated > 0) parts.push(`${updated} updated`);
  if (already > 0) parts.push(`${already} already there`);

  if (parts.length === 0) return `Nothing to add — ${listName} is unchanged.`;
  if (added === 0 && updated === 0) {
    return already === 1
      ? `That card is already on ${listName}.`
      : `All ${already} cards are already on ${listName}.`;
  }
  return `${listName}: ${parts.join(", ")}.`;
}

/**
 * Sends the cards a search just turned up straight onto a want list.
 *
 * This is the join between the two halves of the app: a decklist's gaps are
 * exactly the thing trade matching runs off, and retyping them by hand was
 * the only way to get them there.
 */
export function AddToWantList({ ownerId, cards, label, onChanged }: Props) {
  const [lists, setLists] = useState<WantList[] | null>(null);
  const [target, setTarget] = useState(NEW_LIST);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/owners/${ownerId}/wants`)
      .then((response) => response.json())
      .then((data: { lists?: WantList[] }) => {
        if (cancelled) return;
        const loaded = data.lists ?? [];
        setLists(loaded);
        setTarget(loaded[0]?.id ?? NEW_LIST);
        setStatus(null);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });

    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  async function add() {
    setBusy(true);
    setStatus(null);

    const creating = target === NEW_LIST;
    try {
      const response = await fetch(`/api/owners/${ownerId}/wants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId: creating ? undefined : target,
          name: creating ? name.trim() : undefined,
          cards,
          mode: "add",
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus({ kind: "error", text: data.error ?? "Could not save." });
        return;
      }

      const added: number = data.added ?? 0;
      const updated: number = data.updated ?? 0;
      const listName: string = data.list?.name ?? "your want list";
      const already = cards.length - added - updated;

      setStatus({ kind: "ok", text: summarize(listName, added, updated, already) });
      setName("");
      onChanged();

      // Pick up the new list so a second add lands on it rather than making
      // another one with the same name.
      const refreshed = await fetch(`/api/owners/${ownerId}/wants`).then((r) => r.json());
      setLists(refreshed.lists ?? []);
      if (creating && data.list?.id) setTarget(data.list.id);
    } catch {
      setStatus({ kind: "error", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  if (lists === null || cards.length === 0) return null;

  const copies = cards.reduce((sum, card) => sum + card.quantity, 0);

  return (
    <div
      data-tour="add-to-want-list"
      className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/30"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {label} <span className="text-zinc-500 dark:text-zinc-400">({copies} copies)</span>
        </p>

        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name} ({list.cards.length})
            </option>
          ))}
          <option value={NEW_LIST}>New list…</option>
        </select>

        {target === NEW_LIST && (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Atraxa upgrades"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
        )}

        <button
          onClick={add}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add to want list"}
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
