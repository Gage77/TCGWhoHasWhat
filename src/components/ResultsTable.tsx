"use client";

import Image from "next/image";
import { useState } from "react";

import { CardPreview } from "@/components/CardPreview";
import type { Owner } from "@/lib/db";
import { freshnessOf, money, relativeDate } from "@/lib/format";
import {
  DEFAULT_SORT,
  countFor,
  ownerSortKey,
  sortRows,
  toggleSort,
  type ResultSort,
  type SortKey,
} from "@/lib/resultSort";
import { useResultView, type ResultView } from "@/lib/resultView";
import type { SearchRow } from "@/lib/search";

interface Props {
  rows: SearchRow[];
  owners: Owner[];
  /** Count only copies the owner flagged as available to trade. */
  tradeableOnly: boolean;
  /** The list was checked against the searcher's own collection. */
  deckMode?: boolean;
}

const FINISH_LABEL: Record<string, string> = {
  foil: "Foil",
  etched: "Etched",
  normal: "",
};

/**
 * Prices the copies that actually exist in the group. The reference printing
 * is often a far cheaper version than anyone is holding, so it is only shown
 * as a fallback and labelled as such.
 */
function PriceCell({ row }: { row: SearchRow }) {
  if (row.foundPriceLow === null) {
    return (
      <span title="Nobody has a copy; price is for the default printing">
        {money(row.referencePrice)}
        {row.referencePrice !== null && (
          <span className="ml-1 text-xs text-zinc-400">ref</span>
        )}
      </span>
    );
  }

  const single = row.foundPriceHigh === null || row.foundPriceLow === row.foundPriceHigh;
  return (
    <span title="Value of the copies found in the group">
      {single
        ? money(row.foundPriceLow)
        : `${money(row.foundPriceLow)} – ${money(row.foundPriceHigh)}`}
    </span>
  );
}

/** How many of this card is being asked for, and whether it is a card at all. */
function WantNote({ row, deckMode }: { row: SearchRow; deckMode: boolean }) {
  return (
    <>
      {deckMode ? (
        <span className="ml-2 text-xs text-zinc-500">
          need {row.quantityMissing}
          {row.quantityOwned > 0 && ` of ${row.quantityWanted} — own ${row.quantityOwned}`}
        </span>
      ) : (
        row.quantityWanted > 1 && (
          <span className="ml-2 text-xs text-zinc-500">want {row.quantityWanted}</span>
        )
      )}
      {!row.resolvedName && (
        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          not a card?
        </span>
      )}
    </>
  );
}

/** The card's name, what is wanted of it, and where to read more about it. */
function CardIdentity({ row, deckMode }: { row: SearchRow; deckMode: boolean }) {
  return (
    <>
      <CardPreview
        src={row.imageUri}
        alt={row.resolvedName ?? row.query}
        className="font-medium"
      >
        {row.resolvedName ?? row.query}
      </CardPreview>
      <WantNote row={row} deckMode={deckMode} />
    </>
  );
}

/**
 * Off-site links.
 *
 * Given a padded tap target of their own on a phone, where two 10px words a
 * few pixels apart are a coin toss.
 */
function CardLinks({ row }: { row: SearchRow }) {
  if (!row.scryfallUri && !row.tcgplayerUri) return null;

  const className =
    "-mx-1 inline-block px-1 py-1 text-xs text-zinc-400 underline-offset-2 hover:text-emerald-600 hover:underline sm:py-0";

  return (
    <span className="ml-2 inline-flex items-center gap-2">
      {row.scryfallUri && (
        <a
          href={row.scryfallUri}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={className}
        >
          Scryfall
        </a>
      )}
      {row.tcgplayerUri && (
        <a
          href={row.tcgplayerUri}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={className}
        >
          TCGplayer
        </a>
      )}
    </span>
  );
}

/** Every copy in the group, by owner — what an expanded row reveals. */
function Copies({ row }: { row: SearchRow }) {
  return (
    <div className="space-y-3">
      {row.owners.map((owner) => (
        <div key={owner.ownerId}>
          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            {owner.ownerName}
          </p>
          <ul className="mt-1 space-y-1">
            {owner.copies.map((copy, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400"
              >
                <CardPreview
                  src={copy.imageUri}
                  alt={`${row.resolvedName ?? row.query} (${copy.setName ?? copy.setCode ?? ""})`}
                  className="font-mono uppercase underline decoration-dotted underline-offset-2"
                >
                  {copy.setCode ?? "?"}
                  {copy.collectorNumber ? ` #${copy.collectorNumber}` : ""}
                </CardPreview>
                <span>{copy.setName ?? ""}</span>
                {FINISH_LABEL[copy.finish] && (
                  <span className="rounded bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {FINISH_LABEL[copy.finish]}
                  </span>
                )}
                {copy.condition && <span>{copy.condition}</span>}
                <span className="text-zinc-500">×{copy.quantity}</span>
                <span className="text-zinc-500">({copy.tradelistQuantity} for trade)</span>
                <span
                  className="font-medium text-emerald-600 dark:text-emerald-400"
                  title={
                    copy.priceApproximate
                      ? "No price listed for this finish; showing another finish of the same printing"
                      : undefined
                  }
                >
                  {copy.priceApproximate && copy.price !== null ? "~" : ""}
                  {money(copy.price)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Who has it, as a chip each — the shape a column of counts takes when there
 * is no room for columns: on a phone, and under a piece of card art. */
function OwnerChips({
  row,
  owners,
  tradeableOnly,
}: {
  row: SearchRow;
  owners: Owner[];
  tradeableOnly: boolean;
}) {
  const holders = owners
    .map((owner) => ({ owner, count: countFor(row, owner.id, tradeableOnly) }))
    .filter((entry) => entry.count > 0);

  if (holders.length === 0) {
    return (
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {tradeableOnly ? "Nobody has one for trade" : "Nobody has this"}
      </span>
    );
  }

  return (
    <>
      {holders.map(({ owner, count }) => (
        <span
          key={owner.id}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
        >
          {owner.name}
          <span className="font-semibold tabular-nums">{count}</span>
        </span>
      ))}
    </>
  );
}

/** A column heading that sorts by its own column. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: ResultSort;
  onSort: (key: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const active = sort.key === sortKey;
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
      className={`px-3 py-3 font-semibold first:px-4 ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label.toLowerCase()}`}
        className={`group inline-flex w-full items-center gap-1 uppercase tracking-wide transition hover:text-zinc-800 dark:hover:text-zinc-200 ${justify} ${
          active ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {label}
        {/* A marker on every column, faint until hovered, so the ones that
          * sort are the ones that look like they might. */}
        <span
          aria-hidden="true"
          className={active ? "" : "opacity-0 transition-opacity group-hover:opacity-50"}
        >
          {active && sort.descending ? "▾" : "▴"}
        </span>
      </button>
    </th>
  );
}

/**
 * Sorting for the views without column headers: the phone list, and the
 * gallery at any width.
 */
function SortSelect({
  owners,
  sort,
  onSort,
  className,
}: {
  owners: Owner[];
  sort: ResultSort;
  onSort: (sort: ResultSort) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <select
        value={sort.key}
        onChange={(event) => onSort(toggleSort(sort, event.target.value as SortKey))}
        aria-label="Sort results by"
        className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value="default">Missing cards first</option>
        <option value="name">Name</option>
        <option value="price">Price</option>
        {owners.map((owner) => (
          <option key={owner.id} value={ownerSortKey(owner.id)}>
            {owner.name}&apos;s copies
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={sort.key === "default"}
        onClick={() => onSort({ ...sort, descending: !sort.descending })}
        aria-label={sort.descending ? "Sort ascending" : "Sort descending"}
        title={sort.descending ? "Largest first" : "Smallest first"}
        className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        {sort.descending ? "▾" : "▴"}
      </button>
    </div>
  );
}

/** Rows or card art. */
function ViewToggle({
  view,
  onView,
}: {
  view: ResultView;
  onView: (view: ResultView) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
      {(
        [
          ["rows", "Rows"],
          ["gallery", "Cards"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onView(value)}
          aria-pressed={view === value}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            view === value
              ? "bg-white shadow-sm dark:bg-zinc-950"
              : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The art to show for a row.
 *
 * The reference printing, or — when the line could not be resolved but
 * somebody in the group turns out to have it anyway — a copy that exists.
 */
function artFor(row: SearchRow): string | null {
  if (row.imageUri) return row.imageUri;
  for (const owner of row.owners) {
    for (const copy of owner.copies) {
      if (copy.imageUri) return copy.imageUri;
    }
  }
  return null;
}

/** One card, big enough to recognise across a table. */
function GalleryCard({
  row,
  owners,
  tradeableOnly,
  deckMode,
  isOpen,
  onToggle,
}: {
  row: SearchRow;
  owners: Owner[];
  tradeableOnly: boolean;
  deckMode: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const name = row.resolvedName ?? row.query;
  const art = artFor(row);
  const found = tradeableOnly ? row.totalTradeable > 0 : row.totalAvailable > 0;

  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* The tile art is small; the preview is what makes the text readable,
        * on hover with a mouse and on tap with anything else. */}
      <CardPreview src={art} alt={name} className="block w-full">
        {art ? (
          <Image
            src={art}
            alt={name}
            width={488}
            height={680}
            unoptimized
            className="w-full"
          />
        ) : (
          <span className="flex aspect-[488/680] items-center justify-center border-b border-dashed border-zinc-300 bg-zinc-50 p-3 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
            {name}
          </span>
        )}
      </CardPreview>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-sm leading-tight">
          <span className="font-medium">{name}</span>
          <WantNote row={row} deckMode={deckMode} />
        </p>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <PriceCell row={row} />
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <OwnerChips row={row} owners={owners} tradeableOnly={tradeableOnly} />
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-1">
          <CardLinks row={row} />
          {found && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              className="ml-auto rounded px-1.5 py-1 text-xs text-zinc-500 underline-offset-2 transition hover:text-emerald-600 hover:underline"
            >
              {isOpen ? "Hide copies ▾" : "Which copies ▸"}
            </button>
          )}
        </div>

        {isOpen && (
          <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <Copies row={row} />
          </div>
        )}
      </div>
    </li>
  );
}

export function ResultsTable({ rows, owners, tradeableOnly, deckMode = false }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<ResultSort>(DEFAULT_SORT);
  const [view, setView] = useResultView();

  // A column of counts looks equally authoritative whether the collection
  // behind it was uploaded this morning or last spring.
  const stale = owners.filter((owner) => freshnessOf(owner.updatedAt) !== "fresh");

  const sorted = sortRows(rows, sort, tradeableOnly);

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function onHeader(key: SortKey) {
    setSort((current) => toggleSort(current, key));
  }

  /** Enter and Space on a focused row, which a plain click handler misses. */
  function onRowKey(event: React.KeyboardEvent, key: string, found: boolean) {
    if (!found || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    toggle(key);
  }

  return (
    <div
      data-tour="results-table"
      className="rounded-xl border border-zinc-200 dark:border-zinc-800"
    >
      {stale.length > 0 && (
        <p className="border-b border-zinc-200 bg-amber-50/60 px-4 py-2 text-xs text-amber-800 dark:border-zinc-800 dark:bg-amber-950/30 dark:text-amber-300">
          Counts may be out of date:{" "}
          {stale
            .map((owner) => `${owner.name} (${relativeDate(owner.updatedAt)})`)
            .join(", ")}
          .
        </p>
      )}

      {/*
        * The sort control is only here for the views with no column headers to
        * click: the gallery at any width, and the phone list. On a desktop
        * table it would be a second way to do the same thing.
        */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <SortSelect
          owners={owners}
          sort={sort}
          onSort={setSort}
          className={view === "gallery" ? "" : "md:hidden"}
        />
        {/*
          * Pushed right by a margin rather than by sitting at one end of a
          * spread row: the sort control beside it comes and goes with the
          * view, and a toggle that moves when you press it is a toggle you
          * press twice.
          */}
        <div className="ml-auto">
          <ViewToggle view={view} onView={setView} />
        </div>
      </div>

      {view === "gallery" ? (
        <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sorted.map((row) => (
            <GalleryCard
              key={row.query}
              row={row}
              owners={owners}
              tradeableOnly={tradeableOnly}
              deckMode={deckMode}
              isOpen={expanded.has(row.query)}
              onToggle={() => toggle(row.query)}
            />
          ))}
        </ul>
      ) : (
        <>
          {/*
            * A column per person only works while the columns fit. On a phone
            * the same rows are a list, with each person's count as a chip
            * under the card — no sideways scrolling to find out whether
            * anyone has it.
            */}
          <ul className="md:hidden">
            {sorted.map((row) => {
              const key = row.query;
              const isOpen = expanded.has(key);
              const found = tradeableOnly ? row.totalTradeable > 0 : row.totalAvailable > 0;

              return (
                <li
                  key={key}
                  className="border-t border-zinc-200 first:border-t-0 dark:border-zinc-800"
                >
                  <div
                    onClick={() => found && toggle(key)}
                    onKeyDown={(event) => onRowKey(event, key, found)}
                    role={found ? "button" : undefined}
                    tabIndex={found ? 0 : undefined}
                    aria-expanded={found ? isOpen : undefined}
                    className="flex items-start gap-2 px-4 py-3"
                  >
                    <span className="w-3 shrink-0 pt-0.5 text-xs text-zinc-400">
                      {found ? (isOpen ? "▾" : "▸") : ""}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <CardIdentity row={row} deckMode={deckMode} />
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <OwnerChips row={row} owners={owners} tradeableOnly={tradeableOnly} />
                        <CardLinks row={row} />
                      </div>
                    </div>

                    <span className="shrink-0 pt-0.5 text-sm whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      <PriceCell row={row} />
                    </span>
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pl-9">
                      <Copies row={row} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <SortHeader label="Card" sortKey="name" sort={sort} onSort={onHeader} />
                  <SortHeader
                    label="Price"
                    sortKey="price"
                    sort={sort}
                    onSort={onHeader}
                    align="right"
                  />
                  {owners.map((owner) => (
                    <SortHeader
                      key={owner.id}
                      label={owner.name}
                      sortKey={ownerSortKey(owner.id)}
                      sort={sort}
                      onSort={onHeader}
                      align="center"
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const key = row.query;
                  const isOpen = expanded.has(key);
                  const found = tradeableOnly ? row.totalTradeable > 0 : row.totalAvailable > 0;

                  return (
                    <tr
                      key={key}
                      className="border-t border-zinc-200 align-top dark:border-zinc-800"
                      onClick={() => found && toggle(key)}
                      onKeyDown={(event) => onRowKey(event, key, found)}
                      role={found ? "button" : undefined}
                      tabIndex={found ? 0 : undefined}
                      aria-expanded={found ? isOpen : undefined}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-baseline gap-2">
                          {found && (
                            <span className="text-xs text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                          )}
                          <div className={found ? "" : "pl-4"}>
                            <CardIdentity row={row} deckMode={deckMode} />
                            <CardLinks row={row} />
                          </div>
                        </div>

                        {isOpen && (
                          <div className="mt-3 pl-4">
                            <Copies row={row} />
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        <PriceCell row={row} />
                      </td>

                      {owners.map((owner) => {
                        const count = countFor(row, owner.id, tradeableOnly);
                        const match = row.owners.find((entry) => entry.ownerId === owner.id);

                        return (
                          <td key={owner.id} className="px-3 py-3 text-center">
                            {count > 0 ? (
                              <span
                                className="inline-flex min-w-7 items-center justify-center rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                                title={
                                  match
                                    ? `${match.totalQuantity} owned, ${match.totalTradeable} marked for trade`
                                    : undefined
                                }
                              >
                                {count}
                              </span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-700">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
