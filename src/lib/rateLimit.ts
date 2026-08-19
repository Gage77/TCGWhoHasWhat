/**
 * A fixed-window attempt limiter, kept pure so the arithmetic can be tested.
 *
 * One shared passphrase is a single guessable secret, and without a limit the
 * only thing between it and a script is how fast the server answers. Slowing
 * a guesser to a handful of tries per window turns "wait a few hours" into
 * "wait a few years" for anything longer than a dictionary word.
 *
 * The counters live in memory, so on a serverless host each instance keeps
 * its own. That is a weaker guarantee than a shared store, and deliberately
 * so: the alternative is a database write on every login attempt, which is
 * itself a way to make the site fall over. For a group of half a dozen people
 * this is the right trade — it stops the casual case and costs nothing.
 */

export interface Decision {
  allowed: boolean;
  /** How long until the caller may try again. Zero when allowed. */
  retryAfterSeconds: number;
}

export interface Limiter {
  /** Whether `key` may attempt right now. Does not itself count as a try. */
  check(key: string, now: number): Decision;
  /** Record a failed attempt. */
  fail(key: string, now: number): void;
  /** Forget a key's failures, because it just got it right. */
  succeed(key: string): void;
}

interface Window {
  failures: number;
  /** When this window ends, and the count goes back to zero. */
  resetAt: number;
}

export interface LimiterOptions {
  /** Failures allowed inside one window before the door shuts. */
  limit: number;
  windowMs: number;
  /**
   * Cap on tracked keys. Without one, a spray of forged client addresses is
   * a way to grow the map until the process runs out of memory.
   */
  maxKeys?: number;
}

export function createLimiter({ limit, windowMs, maxKeys = 5_000 }: LimiterOptions): Limiter {
  const windows = new Map<string, Window>();

  /** The live window for a key, dropping one that has already run out. */
  function current(key: string, now: number): Window | null {
    const window = windows.get(key);
    if (!window) return null;
    if (window.resetAt <= now) {
      windows.delete(key);
      return null;
    }
    return window;
  }

  function prune(now: number): void {
    if (windows.size < maxKeys) return;

    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
    // Still full of live windows: drop the oldest, which are the closest to
    // expiring anyway. Map iterates in insertion order, and every entry is
    // inserted when its window opens.
    for (const key of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(key);
    }
  }

  return {
    check(key, now) {
      const window = current(key, now);
      if (!window || window.failures < limit) return { allowed: true, retryAfterSeconds: 0 };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      };
    },

    fail(key, now) {
      const window = current(key, now);
      if (window) {
        window.failures += 1;
        return;
      }
      prune(now);
      // The window starts at the first failure, so an attacker cannot reset
      // it by waiting out a window they never used.
      windows.set(key, { failures: 1, resetAt: now + windowMs });
    },

    succeed(key) {
      windows.delete(key);
    },
  };
}

/**
 * Who is asking, as well as can be told from behind a proxy.
 *
 * `x-forwarded-for` is set by the host's edge and can be forged by anyone
 * talking to the origin directly, so this is a speed bump rather than an
 * identity. Requests with no header at all share one bucket, which is the
 * strict direction to be wrong in.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first.length > 0) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
