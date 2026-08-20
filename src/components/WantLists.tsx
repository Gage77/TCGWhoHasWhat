"use client";

import { useCallback, useEffect, useState } from "react";

import type { WantCard, WantList } from "@/lib/db";

interface Props {
  ownerId: string;
  ownerName: string;
  onChanged: () => void;
}

const PLACEHOLDER = `!Rhystic Study
2x Smothering Tithe
Dockside Extortionist (LCI) 106`;

async function fetchLists(ownerId: string): Promise<WantList[]> {
  const data = await fetch(`/api/owners/${ownerId}/wants`).then((response) => response.json());
  return data.lists ?? [];
}

/**
 * Turn a saved want back into the line that would have produced it, so the
 * editor shows people what they typed rather than a normalized rendering.
 */
function toLine(card: WantCard): string {
  const priority = card.priority > 0 ? "!" : "";
  const quantity = card.quantity > 1 ? `${card.quantity}x ` : "";
  const printing = card.setCode
    ? ` (${card.setCode.toUpperCase()})${card.collectorNumber ? ` ${card.collectorNumber}` : ""}`
    : "";
  return `${priority}${quantity}${card.name}${printing}`;
}

/**
 * Someone's want lists.
 *
 * Several named lists rather than one pile, because a want is really "for my
 * Atraxa deck" — which is also what lets a trade say why the other person
 * wants the card.
 */
export function WantLists({ ownerId, ownerName, onChanged }: Props) {
  const [lists, setLists] = useState<WantList[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settling state from a callback rather than from the effect body: the
  // effect's job is to start the request, not to re-render on the spot.
  useEffect(() => {
    let cancelled = false;
    fetchLists(ownerId).then(
      (loaded) => {
        if (cancelled) return;
        setLists(loaded);
        setEditing(null);
        setError(null);
      },
      () => {
        if (cancelled) return;
        setLists([]);
        setError("Could not load want lists.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  const reload = useCallback(async () => {
    try {
      setLists(await fetchLists(ownerId));
    } catch {
      setError("Could not load want lists.");
    }
  }, [ownerId]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);

    try {
      // A rename and a rewrite are separate operations; do the rename first so
      // a failed save does not leave the list under a name nobody chose.
      if (editing.id) {
        const current = lists?.find((list) => list.id === editing.id);
        if (current && current.name !== editing.name.trim() && editing.name.trim()) {
          await fetch(`/api/owners/${ownerId}/wants`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listId: editing.id, name: editing.name }),
          });
        }
      }

      const response = await fetch(`/api/owners/${ownerId}/wants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId: editing.id ?? undefined,
          name: editing.id ? undefined : editing.name,
          list: editing.text,
          mode: "replace",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }

      setEditing(null);
      await reload();
      onChanged();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(list: WantList) {
    if (!confirm(`Delete "${list.name}"? Its ${list.cards.length} cards stop matching trades.`)) {
      return;
    }
    await fetch(`/api/owners/${ownerId}/wants?listId=${encodeURIComponent(list.id)}`, {
      method: "DELETE",
    });
    await reload();
    onChanged();
  }

  if (lists === null) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading want lists…</p>;
  }

  if (editing) {
    return (
      <div>
        <label
          htmlFor="want-list-name"
          className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          List name
        </label>
        <input
          id="want-list-name"
          value={editing.name}
          onChange={(event) => setEditing({ ...editing, name: event.target.value })}
          placeholder="e.g. Atraxa upgrades"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 sm:max-w-xs dark:border-zinc-700 dark:bg-zinc-950"
        />

        <label
          htmlFor="wants"
          className="mt-3 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          Cards — one per line
        </label>
        <textarea
          id="wants"
          value={editing.text}
          onChange={(event) => setEditing({ ...editing, text: event.target.value })}
          rows={8}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Start a line with <code>!</code> to mark a card as a priority. Naming a printing —{" "}
          <code>(LCI) 106</code> — records which version you are after.
        </p>

        <div className="mt-3 flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:flex-none sm:py-1.5"
          >
            {busy ? "Saving…" : "Save list"}
          </button>
          <button
            onClick={() => setEditing(null)}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500 transition hover:text-zinc-700 sm:flex-none sm:border-0 sm:py-1.5 dark:border-zinc-700 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {lists.length === 0
            ? `${ownerName} has no want lists yet.`
            : `${ownerName}'s want lists`}
        </p>
        <button
          onClick={() => setEditing({ id: null, name: "", text: "" })}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          New list
        </button>
      </div>

      {lists.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lists.map((list) => {
            const priorities = list.cards.filter((card) => card.priority > 0).length;
            return (
              <li
                key={list.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{list.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {list.cards.length} card{list.cards.length === 1 ? "" : "s"}
                    {priorities > 0 && ` · ${priorities} priority`}
                  </p>
                </div>
                <div className="-mr-1 flex shrink-0 gap-1">
                  <button
                    onClick={() =>
                      setEditing({
                        id: list.id,
                        name: list.name,
                        text: list.cards.map(toLine).join("\n"),
                      })
                    }
                    className="rounded px-2.5 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(list)}
                    className="rounded px-2.5 py-1.5 text-xs text-zinc-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
