"use client";

import { useState } from "react";

import { CardPreview } from "@/components/CardPreview";
import { WantLists } from "@/components/WantLists";
import type { Owner } from "@/lib/db";
import { money } from "@/lib/format";
import type { EvenUpSuggestion, TradeCard, TradePartner, TradeReport } from "@/lib/trades";

interface Props {
  owners: Owner[];
  /** Who the user is, chosen once at the top of the page. */
  meId: string;
  wantCounts: Record<string, number>;
  onWantsChanged: () => void;
}

export function TradesPanel({ owners, meId, wantCounts, onWantsChanged }: Props) {
  const [tradeableOnly, setTradeableOnly] = useState(false);
  const [report, setReport] = useState<TradeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = owners.find((owner) => owner.id === meId);
  const myWantCount = wantCounts[meId] ?? 0;

  async function findTrades() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: meId, tradeableOnly }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Could not work out trades.");
      else setReport(data as TradeReport);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (owners.length < 2) {
    return (
      <Notice>Trades need at least two collections. Add another person to get started.</Notice>
    );
  }

  if (!me) {
    return <Notice>Pick who you are at the top of the page to see your trades.</Notice>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={findTrades}
            disabled={busy}
            data-tour="find-trades"
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Find trades"}
          </button>

          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={tradeableOnly}
              onChange={(event) => setTradeableOnly(event.target.checked)}
              className="size-4 accent-emerald-600"
            />
            Only copies marked for trade
          </label>

          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {myWantCount > 0
              ? `${me.name} wants ${myWantCount} card${myWantCount === 1 ? "" : "s"}.`
              : `${me.name} has no saved wants yet.`}
          </p>
        </div>

        <div
          data-tour="want-lists"
          className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800"
        >
          <WantLists ownerId={meId} ownerName={me.name} onChanged={onWantsChanged} />
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>

      {report && report.partners.length === 0 && (
        <Notice>
          {report.youHaveNoWants
            ? `No matches yet. Add a want list for ${report.ownerName}, and make sure others have saved theirs too.`
            : "No overlaps right now — nobody has anything on your list, and nobody wants what you have."}
        </Notice>
      )}

      {report?.partners.map((partner) => (
        <PartnerCard key={partner.ownerId} partner={partner} youName={report.ownerName} />
      ))}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      {children}
    </p>
  );
}

function PartnerCard({ partner, youName }: { partner: TradePartner; youName: string }) {
  const balance = partner.balance;
  const even = Math.abs(balance) < 1;

  return (
    <section
      data-tour="trade-partner"
      className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3 className="text-lg font-semibold">{partner.ownerName}</h3>
        <p className="text-sm">
          {even ? (
            <span className="text-emerald-600 dark:text-emerald-400">Roughly even trade</span>
          ) : balance > 0 ? (
            <span className="text-amber-600 dark:text-amber-400">
              You&apos;d give {money(balance)} more
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400">
              You&apos;d receive {money(-balance)} more
            </span>
          )}
        </p>
      </header>

      {partner.evenUp && (
        <EvenUpNote suggestion={partner.evenUp} youName={youName} themName={partner.ownerName} />
      )}

      <div className="grid gap-px bg-zinc-200 md:grid-cols-2 dark:bg-zinc-800">
        <TradeColumn
          title={`${partner.ownerName} has that you want`}
          cards={partner.theyHave}
          total={partner.theyHaveValue}
        />
        <TradeColumn
          title={`${youName} has that ${partner.ownerName} wants`}
          cards={partner.youHave}
          total={partner.youHaveValue}
        />
      </div>
    </section>
  );
}

/**
 * The cards to leave out to level the two piles.
 *
 * A balance figure on its own leaves people squinting at two columns working
 * out which card to pull; this is the answer they were about to arrive at.
 */
function EvenUpNote({
  suggestion,
  youName,
  themName,
}: {
  suggestion: EvenUpSuggestion;
  youName: string;
  themName: string;
}) {
  const cards = suggestion.drops
    .map((drop) => (drop.quantity > 1 ? `${drop.quantity}× ${drop.name}` : drop.name))
    .join(", ");
  const whose = suggestion.side === "you" ? `${youName} keeps` : `${themName} keeps`;

  return (
    <p className="border-b border-zinc-200 bg-amber-50/70 px-5 py-3 text-sm text-amber-900 dark:border-zinc-800 dark:bg-amber-950/30 dark:text-amber-200">
      <span className="font-medium">To even it up:</span> {whose} {cards} — that closes the gap
      from {money(suggestion.balanceBefore)} to {money(suggestion.balanceAfter)}.
    </p>
  );
}

function TradeColumn({
  title,
  cards,
  total,
}: {
  title: string;
  cards: TradeCard[];
  total: number;
}) {
  return (
    <div className="bg-white p-5 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </h4>
        <span className="text-sm font-medium">{money(total)}</span>
      </div>

      {cards.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400 dark:text-zinc-600">Nothing.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {cards.map((card) => (
            <li key={card.name} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  {card.priority > 0 && (
                    <span
                      className="mr-1 font-bold text-amber-600 dark:text-amber-400"
                      title="Marked as a priority"
                    >
                      !
                    </span>
                  )}
                  {card.quantityMatched > 1 && (
                    <span className="mr-1 text-zinc-500">{card.quantityMatched}×</span>
                  )}
                  <CardPreview src={card.copies[0]?.imageUri ?? null} alt={card.name}>
                    {card.name}
                  </CardPreview>
                  {card.quantityMatched < card.quantityWanted && (
                    <span
                      className="ml-1 text-xs text-amber-600 dark:text-amber-400"
                      title={`Wants ${card.quantityWanted}, only ${card.quantityAvailable} available`}
                    >
                      (of {card.quantityWanted})
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">
                  {money(card.value)}
                </span>
              </div>

              {card.copies[0] && (
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  {card.copies[0].setCode?.toUpperCase() ?? "?"}
                  {card.copies[0].collectorNumber ? ` #${card.copies[0].collectorNumber}` : ""}
                  {card.copies[0].finish !== "normal" ? ` · ${card.copies[0].finish}` : ""}
                  {card.copies[0].condition ? ` · ${card.copies[0].condition}` : ""}
                  {card.wantedPrinting &&
                    (card.hasWantedPrinting ? (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                        · the {card.wantedPrinting} printing asked for
                      </span>
                    ) : (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        · {card.wantedPrinting} was asked for
                      </span>
                    ))}
                </p>
              )}

              {card.lists.length > 0 && (
                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  for {card.lists.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
