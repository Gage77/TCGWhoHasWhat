"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { AddToWantList } from "@/components/AddToWantList";
import { CollectionsPanel } from "@/components/CollectionsPanel";
import { ResultsTable } from "@/components/ResultsTable";
import { Tour, TourButton } from "@/components/Tour";
import { TradesPanel } from "@/components/TradesPanel";
import type { Owner } from "@/lib/db";
import { money } from "@/lib/format";
import type { SearchResponse } from "@/lib/search";
import { TOUR_STEPS, selectorFor, type TourStep } from "@/lib/tour";

type Tab = "search" | "trades";

const PLACEHOLDER = `Sol Ring
4x Lightning Bolt
Rhystic Study
Smothering Tithe`;

const IDENTITY_KEY = "who-has-what:me";

/** The remembered identity, kept in localStorage and shared across tabs. */
const identityStore = {
  listeners: new Set<() => void>(),

  subscribe(listener: () => void) {
    identityStore.listeners.add(listener);
    // Another tab switching person should not leave this one out of date.
    window.addEventListener("storage", listener);
    return () => {
      identityStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },

  read(): string {
    return window.localStorage.getItem(IDENTITY_KEY) ?? "";
  },

  write(id: string) {
    if (id) window.localStorage.setItem(IDENTITY_KEY, id);
    else window.localStorage.removeItem(IDENTITY_KEY);
    for (const listener of identityStore.listeners) listener();
  },
};

/**
 * Who the user is, remembered between visits.
 *
 * Both halves of the app need it — the search tab to subtract your own
 * collection, the trades tab to know whose side you are on — so it is asked
 * once, at the top, rather than separately on each tab.
 *
 * Read through `useSyncExternalStore` because that is what localStorage is:
 * the server render has nobody chosen, and the value arrives on hydration
 * without a render-then-correct flicker.
 */
function useIdentity(owners: Owner[]): [string, (id: string) => void] {
  const stored = useSyncExternalStore(identityStore.subscribe, identityStore.read, () => "");

  // A remembered collection can be removed out from under the choice.
  const meId = owners.some((owner) => owner.id === stored) ? stored : "";
  return [meId, identityStore.write];
}

/**
 * Owners are rendered from server props rather than client state, so an
 * upload just refreshes the route and the list comes back updated.
 */
export function Dashboard({
  owners,
  wantCounts,
  gated,
}: {
  owners: Owner[];
  wantCounts: Record<string, number>;
  /** True when a group passphrase is configured, so signing out means something. */
  gated: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("search");
  const [meId, setMeId] = useIdentity(owners);
  const [list, setList] = useState("");
  /** Treat the list as a decklist and subtract your own collection from it. */
  const [deckMode, setDeckMode] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [tradeableOnly, setTradeableOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Index into `tourSteps`, or null when the tour is not running. */
  const [tourStep, setTourStep] = useState<number | null>(null);
  /** The steps this run will actually show, settled when the tour starts. */
  const [tourSteps, setTourSteps] = useState<TourStep[]>([]);

  const deckOwnerId = deckMode && meId ? meId : "";

  /**
   * Work out which steps this run will show, then start.
   *
   * Results and trade offers only exist once there is something to show, so
   * those steps are dropped up front rather than skipped as we go — otherwise
   * the counter reads "7 of 15" and then jumps to 11, which looks broken.
   */
  function startTour() {
    const plan = TOUR_STEPS.filter(
      (step) =>
        !step.skipIfMissing ||
        (step.target !== null && document.querySelector(selectorFor(step.target)) !== null),
    );

    setTourSteps(plan);
    if (plan[0]?.tab) setTab(plan[0].tab);
    setTourStep(plan.length > 0 ? 0 : null);
  }

  function goToTourStep(next: number) {
    const step = tourSteps[next];
    if (!step) {
      setTourStep(null);
      return;
    }
    // The tab has to change before the target can be found.
    if (step.tab) setTab(step.tab);
    setTourStep(next);
  }

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
  const inDeckMode = Boolean(results?.deckOwnerId);

  // What a search would put on a want list: in deck mode the copies you are
  // still short, otherwise the whole ask.
  const wantDrafts = (results?.rows ?? [])
    .map((row) => ({
      name: row.resolvedName ?? row.query,
      quantity: inDeckMode ? row.quantityMissing : row.quantityWanted,
      priority: row.priority,
      setCode: row.wantedSetCode,
      collectorNumber: row.wantedCollectorNumber,
    }))
    .filter((card) => card.quantity > 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      {/*
        * One row on a desktop. On a phone the title and the two icon-sized
        * controls keep the first line and the identity picker wraps below at
        * full width, where it is a comfortable thing to tap rather than a
        * dropdown squeezed into a corner.
        */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-3 gap-y-4 sm:mb-8">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Who Has What</h1>
          <p className="mt-1 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
            Paste a list of cards and see which of your playgroup&apos;s collections have them.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 self-start sm:self-end sm:pb-1">
          <TourButton onClick={startTour} />

          {gated && (
            <button
              data-tour="sign-out"
              onClick={async () => {
                await fetch("/api/session", { method: "DELETE" });
                router.refresh();
              }}
              className="rounded-lg px-2 py-2 text-xs text-zinc-500 underline-offset-2 transition hover:text-zinc-700 hover:underline dark:hover:text-zinc-300"
            >
              Sign out
            </button>
          )}
        </div>

        {owners.length > 0 && (
          <div data-tour="identity" className="w-full sm:w-auto">
            <label
              htmlFor="me"
              className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              I am
            </label>
            <select
              id="me"
              value={meId}
              onChange={(event) => setMeId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 sm:w-auto dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">Nobody in particular</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      <Tour
        steps={tourSteps}
        index={tourStep}
        onIndex={goToTourStep}
        onClose={() => setTourStep(null)}
      />

      {/*
        * Side by side on a desktop, stacked on a phone — and once there are
        * collections to search, the search goes first. Managing collections is
        * something you do once; scrolling past the whole panel to reach the
        * box you came for is something you would do every visit.
        */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className={owners.length === 0 ? undefined : "order-2 lg:order-1"}>
          <CollectionsPanel owners={owners} onChanged={() => router.refresh()} />
        </div>

        <section className={`space-y-6 ${owners.length === 0 ? "" : "order-1 lg:order-2"}`}>
          <div data-tour="tabs" className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
            {(
              [
                ["search", "Find cards"],
                ["trades", "Trades"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition sm:px-4 sm:py-2 ${
                  tab === value
                    ? "bg-white shadow-sm dark:bg-zinc-950"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/*
            * Kept mounted and hidden, like the search tab: unmounting threw
            * away a trade report the moment you glanced at the other tab.
            */}
          <div className={tab === "trades" ? "" : "hidden"}>
            <TradesPanel
              owners={owners}
              meId={meId}
              wantCounts={wantCounts}
              onWantsChanged={() => router.refresh()}
            />
          </div>

          <div className={tab === "search" ? "space-y-6" : "hidden"}>
          <form
            onSubmit={search}
            data-tour="search-input"
            className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
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

            {/*
              * Stacked on a phone, so each checkbox gets a full-width row to
              * be tapped anywhere along rather than a 16px box to hit.
              */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              <button
                type="submit"
                disabled={searching || owners.length === 0}
                className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:w-auto sm:py-2"
              >
                {searching ? "Searching…" : "Find these cards"}
              </button>

              <label
                data-tour="deck-mode"
                className={`flex w-full items-center gap-2 py-1 text-sm sm:w-auto sm:py-0 ${
                  meId ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-600"
                }`}
                title={
                  meId
                    ? "Paste a decklist to see just the gaps, and who can fill them"
                    : "Tell the app who you are first"
                }
              >
                <input
                  type="checkbox"
                  checked={deckMode && Boolean(meId)}
                  disabled={!meId}
                  onChange={(event) => setDeckMode(event.target.checked)}
                  className="size-5 shrink-0 accent-emerald-600 sm:size-4"
                />
                Show only what I&apos;m missing
              </label>

              <label
                data-tour="tradeable-only"
                className="flex w-full items-center gap-2 py-1 text-sm text-zinc-600 sm:w-auto sm:py-0 dark:text-zinc-400"
              >
                <input
                  type="checkbox"
                  checked={tradeableOnly}
                  onChange={(event) => setTradeableOnly(event.target.checked)}
                  className="size-5 shrink-0 accent-emerald-600 sm:size-4"
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
            <div
              data-tour="results-summary"
              className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm sm:flex sm:flex-wrap sm:gap-6 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {inDeckMode ? (
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

          {inDeckMode && results?.rows.length === 0 && (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              You already own every card on that list.
            </p>
          )}

          {summary && summary.unrecognized.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Not recognised as Magic cards: {summary.unrecognized.join(", ")}
            </p>
          )}

          {meId && wantDrafts.length > 0 && (
            <AddToWantList
              ownerId={meId}
              cards={wantDrafts}
              label={
                inDeckMode
                  ? `Add the ${wantDrafts.length} cards you're still missing to a want list`
                  : `Add these ${wantDrafts.length} cards to a want list`
              }
              onChanged={() => router.refresh()}
            />
          )}

          {results && results.rows.length > 0 && (
            <ResultsTable
              rows={results.rows}
              // Your own copies were subtracted, so your column would read
              // as empty for every remaining card.
              owners={owners.filter((owner) => owner.id !== results.deckOwnerId)}
              tradeableOnly={tradeableOnly}
              deckMode={inDeckMode}
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
