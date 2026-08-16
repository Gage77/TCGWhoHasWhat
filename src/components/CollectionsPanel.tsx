"use client";

import { useRef, useState } from "react";

import type { Owner } from "@/lib/db";
import { relativeDate } from "@/lib/format";

interface Props {
  owners: Owner[];
  onChanged: () => void;
}

export function CollectionsPanel({ owners, onChanged }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];

    if (!name.trim()) return setStatus({ kind: "error", text: "Add a name first." });
    if (!file) return setStatus({ kind: "error", text: "Choose a CSV export." });

    setBusy(true);
    setStatus(null);

    const body = new FormData();
    body.append("name", name.trim());
    body.append("file", file);

    try {
      const response = await fetch("/api/owners", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        setStatus({ kind: "error", text: data.error ?? "Upload failed." });
      } else {
        const skipped = data.skipped > 0 ? `, ${data.skipped} rows skipped` : "";
        setStatus({
          kind: "ok",
          text: `Loaded ${data.owner.cardCount.toLocaleString()} cards for ${data.owner.name}${skipped}.`,
        });
        setName("");
        if (fileRef.current) fileRef.current.value = "";
        onChanged();
      }
    } catch {
      setStatus({ kind: "error", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(owner: Owner) {
    if (!confirm(`Remove ${owner.name}'s collection?`)) return;
    await fetch(`/api/owners/${owner.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
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
            <li
              key={owner.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{owner.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {owner.cardCount.toLocaleString()} cards ·{" "}
                  {owner.uniqueCards.toLocaleString()} unique · updated{" "}
                  {relativeDate(owner.updatedAt)}
                </p>
              </div>
              <button
                onClick={() => remove(owner)}
                className="shrink-0 rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={upload} className="mt-5 space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Whose collection?
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Hunter"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            Re-uploading the same name replaces that person&apos;s collection.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Collection CSV
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="mt-1 w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:hover:file:bg-zinc-700"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Loading…" : "Add collection"}
        </button>

        {status && (
          <p
            className={`text-sm ${
              status.kind === "ok"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {status.text}
          </p>
        )}
      </form>

      <details className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer font-medium">How do I export from Moxfield?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Open your collection on Moxfield.</li>
          <li>
            Use the <strong>⋯</strong> / <strong>Export</strong> button above the card list.
          </li>
          <li>Choose CSV and download.</li>
          <li>Upload that file here.</li>
        </ol>
        <p className="mt-2">
          ManaBox, Deckbox, Archidekt and Helvault exports work too — columns are matched by name.
        </p>
      </details>
    </section>
  );
}
