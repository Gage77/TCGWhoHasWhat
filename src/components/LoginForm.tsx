"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not sign in.");
        return;
      }

      router.replace(next);
      // The gate is checked on the server, so the page behind it has to be
      // re-fetched rather than served from the client router's cache.
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h1 className="text-2xl font-bold tracking-tight">Who Has What</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        This is a private playgroup&apos;s collections. Enter the group passphrase to come in.
      </p>

      <label
        htmlFor="password"
        className="mt-5 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        Group passphrase
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoFocus
        autoComplete="current-password"
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-950"
      />

      <button
        type="submit"
        disabled={busy || !password}
        className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Come in"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
