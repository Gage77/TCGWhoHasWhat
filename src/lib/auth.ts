/**
 * Group password gate: session tokens and constant-time comparison.
 *
 * What the passphrase *is* lives in `config.ts` with the rest of the
 * environment reading; this file only does the cryptography.
 *
 * The app has no per-person accounts on purpose — a playgroup is a group of
 * people who already trust each other, and the thing worth keeping out is the
 * rest of the internet. One shared passphrase does that without anyone having
 * to remember a login.
 */

export const SESSION_COOKIE = "who-has-what-session";

/** Long enough that nobody re-types it before a game night comes round. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_AGE_SECONDS = MAX_AGE_MS / 1000;

const encoder = new TextEncoder();

async function sign(message: string, key: string): Promise<string> {
  const secret = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", secret, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Compare without leaking where two strings first differ. */
function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Comparing a fixed-length digest, so an early return on length is only
  // reachable for a malformed cookie.
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function passwordMatches(attempt: string, password: string): boolean {
  return timingSafeEqual(attempt, password);
}

/**
 * A session is its own issue time plus a signature over it.
 *
 * The passphrase is the signing key, so changing it invalidates every session
 * that was issued under the old one — which is what you want the day someone
 * leaves the group.
 */
export async function createSessionToken(password: string): Promise<string> {
  const issuedAt = Date.now().toString(36);
  return `${issuedAt}.${await sign(issuedAt, password)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  password: string,
): Promise<boolean> {
  if (!token) return false;

  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const issuedAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const age = Date.now() - Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return false;

  return timingSafeEqual(signature, await sign(issuedAt, password));
}
