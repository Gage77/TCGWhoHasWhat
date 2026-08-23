"use client";

import Image from "next/image";
import { useState } from "react";

import { CardPreview } from "@/components/CardPreview";
import type { BrowseCard, BrowsePage } from "@/lib/browse";
import { money } from "@/lib/format";

interface Props {
  ownerId: string;
  /** The first page, rendered on the server so there is no loading flash. */
  page: BrowsePage;
  /** The query and sort that produced it, for asking for the next page. */
  query: string;
  sort: string;
  view: "grid" | "list";
}

const PAGE_SIZE = 60;

/** Foil and etched are worth marking; ordinary printings are not. */
const FINISH_BADGE: Record<string, string> = { foil: "Foil", etched: "Etched" };

/**
 * A card's copies and what they are worth, in the two words there is room for.
 */
function copyLine(card: BrowseCard): string {
  const parts = [`×${card.quantity}`];
  if (card.condition) parts.push(card.condition);
  return parts.join(" · ");
}

function CardImage({ card, className }: { card: BrowseCard; className?: string }) {
  if (!card.imageSmall) {
    // Either the card has not been identified yet or Scryfall has no art for
    // it. Naming it is more use than an empty rectangle.
    return (
      <span
        className={`flex items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 ${className ?? ""}`}
      >
        {card.name}
      </span>
    );
  }

  return (
    <Image
      src={card.imageSmall}
      alt={card.name}
      width={146}
      height={204}
      unoptimized
      className={`w-full rounded-lg ${className ?? ""}`}
    />
  );
}

function GridTile({ card }: { card: BrowseCard }) {
  return (
    <li>
      {/*
        * The small art is all that fits in a grid cell and is unreadable on a
        * phone, so the tile hands the full-size image to the preview: hover on
        * a desktop, tap on anything else.
        */}
      <CardPreview src={card.imageNormal} alt={card.name} className="block w-full">
        <CardImage card={card} className="aspect-[488/680] object-cover" />
      </CardPreview>

      <p className="mt-1.5 truncate text-xs font-medium" title={card.name}>
        {card.name}
      </p>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{copyLine(card)}</span>
        {card.price !== null && (
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {money(card.price)}
          </span>
        )}
        {FINISH_BADGE[card.finish] && (
          <span className="rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {FINISH_BADGE[card.finish]}
          </span>
        )}
      </p>
    </li>
  );
}

function ListRow({ card }: { card: BrowseCard }) {
  return (
    <li className="flex items-center gap-3 border-t border-zinc-200 px-3 py-2 first:border-t-0 dark:border-zinc-800">
      <span className="w-10 shrink-0">
        <CardPreview src={card.imageNormal} alt={card.name} className="block w-full">
          <CardImage card={card} className="aspect-[488/680] object-cover" />
        </CardPreview>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-medium">{card.name}</span>
          {card.manaCost && (
            <span className="font-mono text-xs text-zinc-500">{card.manaCost}</span>
          )}
          {FINISH_BADGE[card.finish] && (
            <span className="rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {FINISH_BADGE[card.finish]}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
          {card.typeLine ?? "Not identified yet"}
          {card.setCode && ` · ${card.setCode.toUpperCase()}`}
          {card.rarity && ` · ${card.rarity}`}
        </span>
      </span>

      <span className="shrink-0 text-right text-xs">
        <span className="block text-zinc-500 dark:text-zinc-400">{copyLine(card)}</span>
        {card.price !== null && (
          <span className="block font-medium text-emerald-600 dark:text-emerald-400">
            {money(card.price)}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * The cards themselves.
 *
 * Later pages are fetched and appended here rather than pushed through the
 * URL, so scrolling a long collection does not fill the history with
 * `offset=180`. The first page still comes from the server, which is why
 * changing a filter re-renders rather than fetches — and why this component is
 * keyed on the filter, so the pile of appended pages goes with it.
 */
export function CardResults({ ownerId, page, query, sort, view }: Props) {
  const [extra, setExtra] = useState<BrowseCard[]>([]);
  const [hasMore, setHasMore] = useState(page.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cards = [...page.cards, ...extra];

  async function loadMore() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: query,
        sort,
        offset: String(cards.length),
        limit: String(PAGE_SIZE),
      });
      const response = await fetch(`/api/owners/${ownerId}/cards?${params}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not load more cards.");
        return;
      }

      setExtra((current) => [...current, ...(data.cards as BrowseCard[])]);
      setHasMore(Boolean(data.hasMore));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  if (cards.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Nothing matches that filter.
      </p>
    );
  }

  return (
    <div>
      {view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {cards.map((card) => (
            <GridTile key={card.id} card={card} />
          ))}
        </ul>
      ) : (
        <ul className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {cards.map((card) => (
            <ListRow key={card.id} card={card} />
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="mt-4 w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium transition hover:bg-zinc-50 disabled:opacity-50 sm:py-2 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {loading
            ? "Loading…"
            : `Show more — ${(page.total - cards.length).toLocaleString()} to go`}
        </button>
      )}
    </div>
  );
}
