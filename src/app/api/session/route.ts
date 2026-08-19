import { NextResponse } from "next/server";

import {
  MAX_AGE_SECONDS,
  SESSION_COOKIE,
  createSessionToken,
  groupPassword,
  passwordMatches,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Sign in with the group passphrase. */
export async function POST(request: Request) {
  const password = groupPassword();
  if (!password) {
    return NextResponse.json({ error: "This site has no passphrase set." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const attempt = typeof body.password === "string" ? body.password : "";

  if (!passwordMatches(attempt, password)) {
    return NextResponse.json({ error: "That is not the passphrase." }, { status: 401 });
  }

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
