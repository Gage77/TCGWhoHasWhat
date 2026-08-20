"use client";

import { useRef, useState } from "react";

import { describeDiff, type CollectionDiff } from "@/lib/collectionDiff";
import type { Owner } from "@/lib/db";
import { freshnessOf, relativeDate } from "@/lib/format";

interface Props {
  owners: Owner[];
  onChanged: () => void;
}

type Source = "csv" | "link";

/** What each tracker calls itself, for instructions worth following. */
const TRACKER_LABELS: Record<string, string> = {
  moxfield: "Moxfield",
  manabox: "ManaBox",
  deckbox: "Deckbox",
  archidekt: "Archidekt",
};

/**
 * How to get a fresh export, as specific as we can be.
 *
 * A CSV collection only gets fresher when someone re-exports it, and the
 * commonest reason they don't is not remembering where the button was.
 */
function updateHint(owner: Owner): string {
  const label = owner.tracker ? TRACKER_LABELS[owner.tracker] : null;
  if (label === "Moxfield") {
    return `Open your ${label} collection, use ⋯ → Export → CSV, and upload it as ${owner.name}.`;
  }
  if (label) return `Export a fresh CSV from ${label} and upload it as ${owner.name}.`;
  return `Export a fresh CSV from wherever you track your collection and upload it as ${owner.name}.`;
}

/** Age styling: quiet until it is old enough to give someone a bad trade. */
const AGE_CLASS: Record<string, string> = {
  fresh: "text-zinc-500 dark:text-zinc-400",
  aging: "text-amber-600 dark:text-amber-400",
  stale: "text-red-600 dark:text-red-400",
};

/** The upload result in one line, including what changed. */
function loadedMessage(name: string, cardCount: number, extra: string, diff?: CollectionDiff) {
  const change = diff ? describeDiff(diff) : null;
  return (
    `Loaded ${cardCount.toLocaleString()} cards for ${name}${extra}` +
    (change ? ` — ${change}.` : ".")
  );
}

export function CollectionsPanel({ owners, onChanged }: Props) {
  const [source, setSource] = useState<Source>("csv");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error" | "hint"; text: string } | null>(
    null,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  /**
   * Adding a collection is a once-per-person job, but the form for it is the
   * longest thing on the page — and on a phone it sits between you and
   * everything else. It stays out of the way until asked for, except when
   * there is nothing here yet and it is the only thing worth doing.
   */
  const [formOpen, setFormOpen] = useState(owners.length === 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /** Set the form up to replace one person's collection. */
  function startUpdate(owner: Owner) {
    setSource("csv");
    setName(owner.name);
    setStatus({ kind: "hint", text: updateHint(owner) });
    setHelpOpen(true);
    setFormOpen(true);
    // A frame late on purpose: the form may have just been revealed, and has
    // no position to scroll to until that render has painted.
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];

    if (source === "csv") {
      if (!name.trim()) return setStatus({ kind: "error", text: "Add a name first." });
      if (!file) return setStatus({ kind: "error", text: "Choose a CSV export." });
    } else if (!url.trim()) {
      return setStatus({ kind: "error", text: "Paste a Deckbox collection link." });
    }

    setBusy(true);
    setStatus({
      kind: "ok",
      text:
        source === "link"
          ? "Reading the collection — large ones take a minute…"
          : "Loading…",
    });

    const body = new FormData();
    body.append("name", name.trim());
    if (source === "csv" && file) body.append("file", file);
    if (source === "link") body.append("url", url.trim());

    try {
      const response = await fetch("/api/owners", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        setStatus({ kind: "error", text: data.error ?? "Import failed." });
      } else {
        const extra =
          data.source === "deckbox"
            ? ` across ${data.pagesFetched} pages`
            : data.skipped > 0
              ? `, ${data.skipped} rows skipped`
              : "";
        setStatus({
          kind: "ok",
          text:
            loadedMessage(data.owner.name, data.owner.cardCount, extra, data.diff) +
            (data.warning ? ` ${data.warning}` : ""),
        });
        setName("");
        setUrl("");
        if (fileRef.current) fileRef.current.value = "";
        onChanged();
      }
    } catch {
      setStatus({ kind: "error", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  async function refresh(owner: Owner) {
    setRefreshing(owner.id);
    setStatus(null);
    try {
      const response = await fetch(`/api/owners/${owner.id}/refresh`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setStatus({ kind: "error", text: data.error ?? "Refresh failed." });
      } else {
        const change = data.diff ? describeDiff(data.diff) : null;
        setStatus({
          kind: "ok",
          text:
            `${owner.name} refreshed — ${data.owner.cardCount.toLocaleString()} cards` +
            (change ? `, ${change}.` : "."),
        });
        onChanged();
      }
    } catch {
      setStatus({ kind: "error", text: "Could not reach the server." });
    } finally {
      setRefreshing(null);
    }
  }

  async function remove(owner: Owner) {
    if (!confirm(`Remove ${owner.name}'s collection?`)) return;
    await fetch(`/api/owners/${owner.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section
      data-tour="collections"
      className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Collections
      </h2>

      {owners.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          No collections yet. Add one below to start comparing.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {owners.map((owner) => (
            <li key={owner.id} className="rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/60">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{owner.name}</span>
                  {owner.sourceUrl ? (
                    <span
                      className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-normal text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                      title={owner.sourceUrl}
                    >
                      linked
                    </span>
                  ) : (
                    owner.tracker &&
                    TRACKER_LABELS[owner.tracker] && (
                      <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-normal text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        {TRACKER_LABELS[owner.tracker]}
                      </span>
                    )
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {owner.cardCount.toLocaleString()} cards ·{" "}
                  {owner.uniqueCards.toLocaleString()} unique ·{" "}
                  <span className={AGE_CLASS[freshnessOf(owner.updatedAt)]}>
                    updated {relativeDate(owner.updatedAt)}
                  </span>
                </p>
              </div>

              {/*
                * On their own line, right-aligned. Squeezed in beside the name
                * these were 24px tall in a 280px column at every screen size,
                * which is a fiddly thing to hit and an expensive thing to miss
                * when one of them is Remove.
                */}
              <div className="-mr-1 mt-1.5 flex flex-wrap justify-end gap-1">
                {!owner.sourceUrl && (
                  <button
                    onClick={() => startUpdate(owner)}
                    data-tour="update-collection"
                    className="rounded px-2.5 py-1.5 text-xs text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400"
                  >
                    Update
                  </button>
                )}
                {owner.sourceUrl && (
                  <button
                    onClick={() => refresh(owner)}
                    disabled={refreshing === owner.id}
                    className="rounded px-2.5 py-1.5 text-xs text-zinc-500 transition hover:bg-sky-50 hover:text-sky-600 disabled:opacity-50 dark:hover:bg-sky-950 dark:hover:text-sky-400"
                  >
                    {refreshing === owner.id ? "Refreshing…" : "Refresh"}
                  </button>
                )}
                <button
                  onClick={() => remove(owner)}
                  className="rounded px-2.5 py-1.5 text-xs text-zinc-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {owners.length > 0 && (
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          aria-expanded={formOpen}
          className="mt-4 w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-sm text-zinc-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
        >
          {formOpen ? "Done adding" : "Add a collection"}
        </button>
      )}

      <form
        ref={formRef}
        onSubmit={add}
        className={`mt-5 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 ${
          formOpen ? "" : "hidden"
        }`}
      >
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {(["csv", "link"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSource(option);
                setStatus(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                source === option
                  ? "bg-white shadow-sm dark:bg-zinc-950"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {option === "csv" ? "CSV file" : "Deckbox link"}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Whose collection?{" "}
            {source === "link" && <span className="font-normal">(optional)</span>}
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={source === "link" ? "Taken from Deckbox if blank" : "e.g. Hunter"}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            Re-uploading the same name replaces that person&apos;s collection.
          </p>
        </div>

        {source === "csv" ? (
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Collection CSV
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain,application/csv,application/vnd.ms-excel"
              className="mt-1 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2.5 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:hover:file:bg-zinc-700"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Deckbox collection link
            </label>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://deckbox.org/sets/123456"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
              The collection must be public. Add <code>?s=t</code> to import only cards marked
              for trade. Linked collections get a <strong>Refresh</strong> button.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:py-2"
        >
          {busy ? "Working…" : "Add collection"}
        </button>

        {status && (
          <p
            className={`text-sm ${
              status.kind === "ok"
                ? "text-emerald-600 dark:text-emerald-400"
                : status.kind === "hint"
                  ? "text-zinc-600 dark:text-zinc-300"
                  : "text-red-600 dark:text-red-400"
            }`}
          >
            {status.text}
          </p>
        )}
      </form>

      <details
        open={helpOpen}
        onToggle={(event) => setHelpOpen(event.currentTarget.open)}
        className="mt-4 text-xs text-zinc-500 dark:text-zinc-400"
      >
        <summary className="cursor-pointer py-1 font-medium">Where do I get these?</summary>
        <p className="mt-2 font-medium">Moxfield, ManaBox, Archidekt, Helvault (CSV)</p>
        <ol className="mt-1 list-decimal space-y-1 pl-4">
          <li>Open your collection.</li>
          <li>
            Use the <strong>Export</strong> option and choose CSV.
          </li>
          <li>Upload the file here.</li>
        </ol>
        <p className="mt-2 font-medium">Deckbox (link)</p>
        <p className="mt-1">
          Copy the URL of your inventory page — it looks like{" "}
          <code>deckbox.org/sets/123456</code>. Deckbox is the only major site that serves
          collections publicly, so it is the only one that can be imported by link.
        </p>
      </details>
    </section>
  );
}
