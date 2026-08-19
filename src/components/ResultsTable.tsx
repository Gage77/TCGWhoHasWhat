"use client";

import { useState } from "react";

import { CardPreview } from "@/components/CardPreview";
import type { Owner } from "@/lib/db";
import { money } from "@/lib/format";
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

export function ResultsTable({ rows, owners, tradeableOnly, deckMode = false }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div
      data-tour="results-table"
      className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800"
    >
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
                role={found ? "button" : undefined}
              >
                <td className="px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    {found && (
                      <span className="text-xs text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                    )}
                    <div className={found ? "" : "pl-4"}>
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
                          <span className="ml-2 text-xs text-zinc-500">
                            want {row.quantityWanted}
                          </span>
                        )
                      )}
                      {!row.resolvedName && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          not a card?
                        </span>
                      )}
                      {row.scryfallUri && (
                        <a
                          href={row.scryfallUri}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="ml-2 text-xs text-zinc-400 underline-offset-2 hover:text-emerald-600 hover:underline"
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
                          className="ml-2 text-xs text-zinc-400 underline-offset-2 hover:text-emerald-600 hover:underline"
                        >
                          TCGplayer
                        </a>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 space-y-3 pl-4">
                      {row.owners.map((owner) => (
                        <div key={owner.ownerId}>
                          <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                            {owner.ownerName}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {owner.copies.map((copy, index) => (
                              <li
                                key={index}
                                className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-600 dark:text-zinc-400"
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
                                <span className="text-zinc-500">
                                  ({copy.tradelistQuantity} for trade)
                                </span>
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
                  )}
                </td>

                <td className="px-3 py-3 text-right whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                  <PriceCell row={row} />
                </td>

                {owners.map((owner) => {
                  const match = row.owners.find((entry) => entry.ownerId === owner.id);
                  const count = tradeableOnly ? match?.totalTradeable ?? 0 : match?.totalQuantity ?? 0;

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
  );
}
