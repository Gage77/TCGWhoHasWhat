"use client";

import { useState } from "react";

import { CardPreview } from "@/components/CardPreview";
import type { Owner } from "@/lib/db";
import { freshnessOf, money, relativeDate } from "@/lib/format";
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

/** How many copies of this card that owner has, under the current filter. */
function countFor(row: SearchRow, ownerId: string, tradeableOnly: boolean): number {
  const match = row.owners.find((entry) => entry.ownerId === ownerId);
  if (!match) return 0;
  return tradeableOnly ? match.totalTradeable : match.totalQuantity;
}

export function ResultsTable({ rows, owners, tradeableOnly, deckMode = false }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // A column of counts looks equally authoritative whether the collection
  // behind it was uploaded this morning or last spring.
  const stale = owners.filter((owner) => freshnessOf(owner.updatedAt) !== "fresh");

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
        * A column per person only works while the columns fit. On a phone the
        * same rows are a list, with each person's count as a chip under the
        * card — no sideways scrolling to find out whether anyone has it.
        */}
      <ul className="md:hidden">
        {rows.map((row) => {
          const key = row.query;
          const isOpen = expanded.has(key);
          const holders = owners
            .map((owner) => ({ owner, count: countFor(row, owner.id, tradeableOnly) }))
            .filter((entry) => entry.count > 0);
          const found = holders.length > 0;

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
                    {found ? (
                      holders.map(({ owner, count }) => (
                        <span
                          key={owner.id}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                        >
                          {owner.name}
                          <span className="font-semibold tabular-nums">{count}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {tradeableOnly ? "Nobody has one for trade" : "Nobody has this"}
                      </span>
                    )}
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
              <th className="px-4 py-3 font-semibold">Card</th>
              <th className="px-3 py-3 text-right font-semibold">Price</th>
              {owners.map((owner) => (
                <th key={owner.id} className="px-3 py-3 text-center font-semibold">
                  {owner.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
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
    </div>
  );
}
