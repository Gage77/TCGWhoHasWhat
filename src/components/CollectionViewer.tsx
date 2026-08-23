"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { CardResults } from "@/components/CardResults";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NoIdentityNote, WantTargetBar, useWantTarget } from "@/components/WantTarget";
import type { BrowseCard, BrowsePage, CollectionFacets } from "@/lib/browse";
import { SORTS } from "@/lib/cardQuerySql";
import type { Owner } from "@/lib/db";
import { freshnessOf, money, relativeDate } from "@/lib/format";
import { useIdentity } from "@/lib/identity";
import { cardToWant } from "@/lib/wantDrafts";
import {
  activeFilterCount,
  fullQuery,
  toggle,
  writeControls,
  type FilterControls,
} from "@/lib/filterControls";

interface Props {
  owner: Owner;
  /** Everyone in the group, so the remembered identity can be checked. */
  owners: Owner[];
  page: BrowsePage;
  facets: CollectionFacets;
  /** What the parser made of the query, in words worth showing. */
  warnings: string[];
  /** How much of the collection can be filtered yet. */
  identifying: { total: number; identified: number; remaining: number };
  /** The state the URL is currently describing. */
  text: string;
  controls: FilterControls;
  sort: string;
  view: "grid" | "list";
}

const SORT_LABELS: Record<keyof typeof SORTS, string> = {
  name: "Name",
  price: "Most valuable",
  cheapest: "Cheapest",
  cmc: "Mana value",
  rarity: "Rarity",
  released: "Newest",
  quantity: "Most copies",
  color: "Colour",
};

/** Enough of a mana colour to be recognised at chip size. */
const COLOR_CHIPS: Array<{ code: string; label: string; className: string }> = [
  { code: "W", label: "White", className: "bg-amber-100 text-amber-900 dark:bg-amber-200/20 dark:text-amber-200" },
  { code: "U", label: "Blue", className: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200" },
  { code: "B", label: "Black", className: "bg-zinc-300 text-zinc-900 dark:bg-zinc-100/20 dark:text-zinc-200" },
  { code: "R", label: "Red", className: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200" },
  { code: "G", label: "Green", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" },
  { code: "C", label: "Colourless", className: "bg-stone-200 text-stone-800 dark:bg-stone-400/20 dark:text-stone-200" },
];

/** How long to wait after a keystroke before filtering. */
const TYPING_PAUSE_MS = 350;

function Chip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? `ring-2 ring-emerald-500 ${tone ?? "bg-emerald-600 text-white"}`
          : (tone ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
      }`}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Range({
  label,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  min: number | null;
  max: number | null;
  step?: string;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const parse = (value: string) => (value === "" ? null : Number.parseFloat(value));

  return (
    <Group title={label}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={min ?? ""}
          onChange={(event) => onChange(parse(event.target.value), max)}
          placeholder="min"
          aria-label={`${label} minimum`}
          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="text-xs text-zinc-400">to</span>
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={max ?? ""}
          onChange={(event) => onChange(min, parse(event.target.value))}
          placeholder="max"
          aria-label={`${label} maximum`}
          className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>
    </Group>
  );
}

/**
 * Somebody's collection, filtered.
 *
 * The filter lives in the URL rather than in state here, so a filtered
 * collection is a link you can send — "here is everything I have that fits
 * your deck" — and the back button undoes a filter instead of leaving the
 * page. Changing one re-renders on the server; only paging appends on the
 * client, since nobody wants `offset=180` in their history.
 */
export function CollectionViewer({
  owner,
  owners,
  page,
  facets,
  warnings,
  identifying,
  text,
  controls,
  sort,
  view,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [meId] = useIdentity(owners);
  const [wantStatus, setWantStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // The query box is typed into, so it is held locally and pushed on a pause.
  const [draft, setDraft] = useState(text);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** What we last put in the URL, to tell our own edits from a Back press. */
  const pushed = useRef(text);

  // A Back press changes the prop out from under the box; a keystroke changes
  // the box and then the prop. Only the first should overwrite what is typed.
  useEffect(() => {
    if (text !== pushed.current) {
      pushed.current = text;
      setDraft(text);
    }
  }, [text]);

  function navigate(next: {
    text?: string;
    controls?: FilterControls;
    sort?: string;
    view?: string;
  }) {
    const params = new URLSearchParams({
      ...writeControls(next.controls ?? controls),
      ...(next.sort ?? sort ? { sort: next.sort ?? sort } : {}),
      ...((next.view ?? view) === "list" ? { view: "list" } : {}),
    });

    const query = (next.text ?? draft).trim();
    if (query) params.set("q", query);

    pushed.current = query;
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `/collections/${owner.id}?${search}` : `/collections/${owner.id}`);
    });
  }

  // Typing filters on a pause rather than on a keystroke — every change is a
  // round trip, and a 20,000-card collection is not worth one per letter.
  useEffect(() => {
    if (draft.trim() === text.trim()) return;
    const timer = setTimeout(() => navigate({ text: draft }), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function update(patch: Partial<FilterControls>) {
    navigate({ controls: { ...controls, ...patch } });
  }

  const active = activeFilterCount(controls);
  const query = fullQuery(text, controls);
  const stale = freshnessOf(owner.updatedAt) !== "fresh";

  // Wants belong to the person browsing, not to whoever owns the cards — which
  // is also why there is nothing to do here when they are the same person.
  const browsingOwn = meId === owner.id;
  const canWant = Boolean(meId) && !browsingOwn;
  const wants = useWantTarget(canWant ? meId : "", owner.id, query);

  async function addFiltered() {
    setWantStatus(null);
    try {
      setWantStatus({ kind: "ok", text: await wants.addFiltered() });
      // The trades tab reads want counts off the server render.
      startTransition(() => router.refresh());
    } catch (error) {
      setWantStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not add those cards.",
      });
    }
  }

  const onWant = canWant
    ? async (card: BrowseCard) => wants.addCard(cardToWant(card))
    : null;

  // What is already on the list being added to, so cards can say so.
  const wantedNames = new Set(
    (wants.lists?.find((list) => list.id === wants.target)?.cards ?? []).map((card) =>
      card.name.toLowerCase(),
    ),
  );

  const filters = (
    <div className="space-y-5">
      <Group title="Colour">
        <div className="flex flex-wrap gap-1.5">
          {COLOR_CHIPS.map((color) => (
            <Chip
              key={color.code}
              active={controls.colors.includes(color.code)}
              onClick={() => update({ colors: toggle(controls.colors, color.code) })}
              tone={color.className}
            >
              {color.label}
            </Chip>
          ))}
        </div>
      </Group>

      {facets.types.length > 0 && (
        <Group title="Type">
          <div className="flex flex-wrap gap-1.5">
            {facets.types.map((entry) => (
              <Chip
                key={entry.type}
                active={controls.types.includes(entry.type)}
                onClick={() => update({ types: toggle(controls.types, entry.type) })}
              >
                {entry.type} <span className="opacity-60">{entry.count}</span>
              </Chip>
            ))}
          </div>
        </Group>
      )}

      {facets.rarities.length > 0 && (
        <Group title="Rarity">
          <div className="flex flex-wrap gap-1.5">
            {facets.rarities.map((entry) => (
              <Chip
                key={entry.rarity}
                active={controls.rarities.includes(entry.rarity)}
                onClick={() => update({ rarities: toggle(controls.rarities, entry.rarity) })}
              >
                {entry.rarity} <span className="opacity-60">{entry.count}</span>
              </Chip>
            ))}
          </div>
        </Group>
      )}

      <Range
        label="Mana value"
        min={controls.mvMin}
        max={controls.mvMax}
        onChange={(mvMin, mvMax) => update({ mvMin, mvMax })}
      />

      <Range
        label="Price (USD)"
        step="0.01"
        min={controls.priceMin}
        max={controls.priceMax}
        onChange={(priceMin, priceMax) => update({ priceMin, priceMax })}
      />

      {facets.sets.length > 1 && (
        <Group title="Set">
          <select
            value={controls.sets[0] ?? ""}
            onChange={(event) =>
              update({ sets: event.target.value ? [event.target.value] : [] })
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">Every set</option>
            {facets.sets.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name ?? entry.code.toUpperCase()} ({entry.count})
              </option>
            ))}
          </select>
        </Group>
      )}

      <Group title="Copies">
        <div className="space-y-1">
          <label className="flex items-center gap-2 py-1 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={controls.tradeableOnly}
              onChange={(event) => update({ tradeableOnly: event.target.checked })}
              className="size-5 shrink-0 accent-emerald-600 sm:size-4"
            />
            Only copies marked for trade
          </label>
          <label className="flex items-center gap-2 py-1 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={controls.foilOnly}
              onChange={(event) => update({ foilOnly: event.target.checked })}
              className="size-5 shrink-0 accent-emerald-600 sm:size-4"
            />
            Only foils
          </label>
        </div>
      </Group>

      {active > 0 && (
        <button
          type="button"
          onClick={() => navigate({ controls: { ...controls, ...CLEARED } })}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Clear {active} filter{active === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="text-sm text-zinc-500 underline-offset-2 hover:text-emerald-600 hover:underline dark:text-zinc-400"
        >
          ← All collections
        </Link>
        {/* Reading through someone's cards is exactly when the lights matter. */}
        <ThemeToggle />
      </div>

      <header className="mt-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{owner.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {owner.cardCount.toLocaleString()} cards · {owner.uniqueCards.toLocaleString()} unique
          ·{" "}
          <span className={stale ? "text-amber-600 dark:text-amber-400" : undefined}>
            updated {relativeDate(owner.updatedAt)}
          </span>
        </p>
      </header>

      {identifying.remaining > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <span>
            Still working out what {identifying.remaining.toLocaleString()} of these cards are.
            They will list, but cannot be filtered by colour or type yet.
          </span>
          <button
            onClick={() => startTransition(() => router.refresh())}
            className="font-medium underline underline-offset-2"
          >
            Check again
          </button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* A sidebar on a desktop, a sheet from the bottom on a phone. */}
        <aside className="hidden lg:block">{filters}</aside>

        <section className="min-w-0">
          <div className="mb-4 space-y-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Search, or c:u t:instant mv<=3"
              spellCheck={false}
              aria-label="Search this collection"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 sm:py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-50 lg:hidden dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Filters{active > 0 && ` (${active})`}
              </button>

              <select
                value={sort}
                onChange={(event) => navigate({ sort: event.target.value })}
                aria-label="Sort by"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
                {(["grid", "list"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => navigate({ view: option })}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                      view === option
                        ? "bg-white shadow-sm dark:bg-zinc-950"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <p
                className={`ml-auto text-sm text-zinc-500 transition-opacity dark:text-zinc-400 ${
                  pending ? "opacity-50" : ""
                }`}
              >
                {page.total.toLocaleString()} of {identifying.total.toLocaleString()} ·{" "}
                {page.totalCopies.toLocaleString()} copies · {money(page.totalValue)}
              </p>
            </div>

            {canWant ? (
              <WantTargetBar
                state={wants}
                matching={page.total}
                filtered={active > 0 || text.trim() !== ""}
                status={wantStatus}
                onAddFiltered={addFiltered}
              />
            ) : (
              <NoIdentityNote browsingOwn={browsingOwn} />
            )}

            {warnings.map((warning) => (
              <p
                key={warning}
                className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
              >
                {warning}
              </p>
            ))}
          </div>

          {/*
            * Keyed on the filter: the appended pages belong to the query that
            * asked for them, and should go when it does.
            */}
          <CardResults
            key={`${query}|${sort}`}
            ownerId={owner.id}
            onWant={onWant}
            wanted={wantedNames}
            page={page}
            query={query}
            sort={sort}
            view={view}
          />
        </section>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <button
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-zinc-950/50"
          />
          <div className="relative max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Filters</h2>
              <button
                onClick={() => setSheetOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-500"
              >
                Done
              </button>
            </div>
            {filters}
            <button
              onClick={() => setSheetOpen(false)}
              className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white"
            >
              Show {page.total.toLocaleString()} card{page.total === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Everything a "clear filters" press resets. */
const CLEARED = {
  colors: [],
  types: [],
  rarities: [],
  sets: [],
  mvMin: null,
  mvMax: null,
  priceMin: null,
  priceMax: null,
  tradeableOnly: false,
  foilOnly: false,
} satisfies FilterControls;
