import { NextResponse } from "next/server";

import {
  MAX_AGE_SECONDS,
  SESSION_COOKIE,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";
import { groupPassword } from "@/lib/config";
import { clientKey, createLimiter } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Eight wrong guesses in ten minutes and that address waits.
 *
 * Loose enough that nobody fat-fingering a four-word passphrase on a phone
 * ever meets it, tight enough that guessing is not a strategy.
 */
const attempts = createLimiter({ limit: 8, windowMs: 10 * 60 * 1000 });

/** Sign in with the group passphrase. */
export async function POST(request: Request) {
  const password = groupPassword();
  if (!password) {
    return NextResponse.json({ error: "This site has no passphrase set." }, { status: 503 });
  }

  const who = clientKey(request.headers);
  const now = Date.now();
  const decision = attempts.check(who, now);
  if (!decision.allowed) {
    const minutes = Math.ceil(decision.retryAfterSeconds / 60);
    return NextResponse.json(
      { error: `Too many wrong guesses. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const attempt = typeof body.password === "string" ? body.password : "";

  if (!passwordMatches(attempt, password)) {
    attempts.fail(who, now);
    return NextResponse.json({ error: "That is not the passphrase." }, { status: 401 });
  }

  attempts.succeed(who);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    // Set over plain HTTP in development, where there is no certificate.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}

/** Sign out. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
