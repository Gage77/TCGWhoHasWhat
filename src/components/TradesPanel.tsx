"use client";

import { useState } from "react";

import type { Owner } from "@/lib/db";
import { money } from "@/lib/format";
import type { TradeCard, TradePartner, TradeReport } from "@/lib/trades";

interface Props {
  owners: Owner[];
  wantCounts: Record<string, number>;
  onWantsChanged: () => void;
}

const WANT_PLACEHOLDER = `Rhystic Study
2x Smothering Tithe
Dockside Extortionist`;

export function TradesPanel({ owners, wantCounts, onWantsChanged }: Props) {
  const [meId, setMeId] = useState(owners[0]?.id ?? "");
  const [tradeableOnly, setTradeableOnly] = useState(false);
  const [report, setReport] = useState<TradeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [wantText, setWantText] = useState("");
  const [savingWants, setSavingWants] = useState(false);

  const me = owners.find((owner) => owner.id === meId);
  const myWantCount = wantCounts[meId] ?? 0;

  async function openWantEditor() {
    setError(null);
    try {
      const response = await fetch(`/api/owners/${meId}/wants`);
      const data = await response.json();
      setWantText(
        (data.wants ?? [])
          .map((want: { name: string; quantity: number }) =>
            want.quantity > 1 ? `${want.quantity}x ${want.name}` : want.name,
          )
          .join("\n"),
      );
      setEditing(true);
    } catch {
      setError("Could not load that want list.");
    }
  }

  async function saveWants() {
    setSavingWants(true);
    setError(null);
    try {
      const response = await fetch(`/api/owners/${meId}/wants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: wantText }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error ?? "Could not save.");
      else {
        setEditing(false);
        onWantsChanged();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSavingWants(false);
    }
  }

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
      <p className="rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Trades need at least two collections. Add another person to get started.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="me"
              className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              I am
            </label>
            <select
              id="me"
              value={meId}
              onChange={(event) => {
                setMeId(event.target.value);
                setReport(null);
                setEditing(false);
              }}
              className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={findTrades}
            disabled={busy}
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
        </div>

        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {editing ? (
            <div>
              <label
                htmlFor="wants"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                {me?.name}&apos;s want list — one card per line
              </label>
              <textarea
                id="wants"
                value={wantText}
                onChange={(event) => setWantText(event.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={WANT_PLACEHOLDER}
                className="mt-1 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={saveWants}
                  disabled={savingWants}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {savingWants ? "Saving…" : "Save want list"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-4 py-1.5 text-sm text-zinc-500 transition hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {myWantCount > 0 ? (
                  <>
                    {me?.name} wants{" "}
                    <strong>
                      {myWantCount} card{myWantCount === 1 ? "" : "s"}
                    </strong>
                    .
                  </>
                ) : (
                  <>{me?.name} has no saved want list yet.</>
                )}
              </p>
              <button
                onClick={openWantEditor}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {myWantCount > 0 ? "Edit want list" : "Add a want list"}
              </button>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>

      {report && report.partners.length === 0 && (
        <p className="rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {report.youHaveNoWants
            ? `No matches yet. Add a want list for ${report.ownerName}, and make sure others have saved theirs too.`
            : "No overlaps right now — nobody has anything on your list, and nobody wants what you have."}
        </p>
      )}

      {report?.partners.map((partner) => (
        <PartnerCard key={partner.ownerId} partner={partner} youName={report.ownerName} />
      ))}
    </div>
  );
}

function PartnerCard({ partner, youName }: { partner: TradePartner; youName: string }) {
  const balance = partner.balance;
  const even = Math.abs(balance) < 1;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
                  {card.quantityMatched > 1 && (
                    <span className="mr-1 text-zinc-500">{card.quantityMatched}×</span>
                  )}
                  {card.name}
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
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
