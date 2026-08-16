"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CollectionsPanel } from "@/components/CollectionsPanel";
import { ResultsTable } from "@/components/ResultsTable";
import { TradesPanel } from "@/components/TradesPanel";
import type { Owner } from "@/lib/db";
import { money } from "@/lib/format";
import type { SearchResponse } from "@/lib/search";

type Tab = "search" | "trades";

const PLACEHOLDER = `Sol Ring
4x Lightning Bolt
Rhystic Study
Smothering Tithe`;

/**
 * Owners are rendered from server props rather than client state, so an
 * upload just refreshes the route and the list comes back updated.
 */
export function Dashboard({
  owners,
  wantCounts,
}: {
  owners: Owner[];
  wantCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("search");
  const [list, setList] = useState("");
  /** When set, the list is treated as a decklist and this person's collection is subtracted. */
  const [deckOwnerId, setDeckOwnerId] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [tradeableOnly, setTradeableOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!list.trim()) return;

    setSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list, deckOwnerId: deckOwnerId || undefined }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Search failed.");
      else setResults(data as SearchResponse);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSearching(false);
    }
  }

  const summary = results?.summary;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Who Has What</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Paste a list of cards and see which of your playgroup&apos;s collections have them.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <CollectionsPanel owners={owners} onChanged={() => router.refresh()} />

        <section className="space-y-6">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {(
              [
                ["search", "Find cards"],
                ["trades", "Trades"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                  tab === value
                    ? "bg-white shadow-sm dark:bg-zinc-950"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "trades" && (
            <TradesPanel
              owners={owners}
              wantCounts={wantCounts}
              onWantsChanged={() => router.refresh()}
            />
          )}

          <div className={tab === "search" ? "space-y-6" : "hidden"}>
          <form
            onSubmit={search}
            className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <label
              htmlFor="wantlist"
              className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              Cards to look for
            </label>
            <textarea
              id="wantlist"
              value={list}
              onChange={(event) => setList(event.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={PLACEHOLDER}
              className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              One card per line. Quantities (<code>4x Sol Ring</code>) and pasted decklists both
              work.
            </p>

            <div className="mt-4">
              <label
                htmlFor="deckowner"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                Subtract a collection first
              </label>
              <select
                id="deckowner"
                value={deckOwnerId}
                onChange={(event) => setDeckOwnerId(event.target.value)}
                className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="">Don&apos;t subtract — show every card</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    I am {owner.name} — show only what I&apos;m missing
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Paste a decklist and pick yourself to see just the gaps, and who can fill them.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={searching || owners.length === 0}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {searching ? "Searching…" : "Find these cards"}
              </button>

              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={tradeableOnly}
                  onChange={(event) => setTradeableOnly(event.target.checked)}
                  className="size-4 accent-emerald-600"
                />
                Only count copies marked for trade
              </label>

              {owners.length === 0 && (
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  Add at least one collection first.
                </span>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          </form>

          {summary && (
            <div className="flex flex-wrap gap-6 rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              {results?.deckOwnerId ? (
                <>
                  <Stat
                    label="Already own"
                    value={summary.cardsAlreadyOwned.toString()}
                    tone="text-emerald-600 dark:text-emerald-400"
                  />
                  <Stat label="Still need" value={summary.cardsSearched.toString()} />
                  <Stat
                    label="Copies to find"
                    value={summary.copiesNeeded.toString()}
                  />
                  <Stat
                    label="Nobody has"
                    value={summary.cardsMissing.toString()}
                    tone={
                      summary.cardsMissing > 0 ? "text-amber-600 dark:text-amber-400" : undefined
                    }
                  />
                  <Stat label="Cost to fill gaps" value={money(summary.totalValueFound)} />
                </>
              ) : (
                <>
                  <Stat label="Searched" value={summary.cardsSearched.toString()} />
                  <Stat
                    label="Someone has"
                    value={summary.cardsFound.toString()}
                    tone="text-emerald-600 dark:text-emerald-400"
                  />
                  <Stat
                    label="Nobody has"
                    value={summary.cardsMissing.toString()}
                    tone={
                      summary.cardsMissing > 0 ? "text-amber-600 dark:text-amber-400" : undefined
                    }
                  />
                  <Stat label="Value of copies found" value={money(summary.totalValueFound)} />
                </>
              )}
            </div>
          )}

          {results?.deckOwnerId && results.rows.length === 0 && (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              You already own every card on that list.
            </p>
          )}

          {summary && summary.unrecognized.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Not recognised as Magic cards: {summary.unrecognized.join(", ")}
            </p>
          )}

          {results && results.rows.length > 0 && (
            <ResultsTable
              rows={results.rows}
              // Your own copies were subtracted, so your column would read
              // as empty for every remaining card.
              owners={owners.filter((owner) => owner.id !== results.deckOwnerId)}
              tradeableOnly={tradeableOnly}
              deckMode={Boolean(results.deckOwnerId)}
            />
          )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`text-xl font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
