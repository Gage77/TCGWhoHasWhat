/**
 * The gate. Everything behind it works as it always did.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`; it runs on the
 * Node runtime, which is what lets it share `@/lib/auth` with the route that
 * issues the cookie.
 */

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { configProblem, groupPassword } from "@/lib/config";

export const config = {
  // Everything except the static assets a login page still needs to render.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/** Routes that have to stay reachable to get through the gate at all. */
const OPEN_PATHS = new Set(["/login", "/api/session"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A deploy missing a passphrase or a database is refused here rather than
  // at the first query, so the mistake is named on the very first request
  // instead of surfacing as a 500 once somebody uploads something.
  const problem = configProblem();
  if (problem) {
    return new NextResponse(problem, {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const password = groupPassword();
  if (!password) return NextResponse.next();

  const signedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, password);

  if (OPEN_PATHS.has(pathname)) {
    // No point showing the login page to someone who is already in.
    if (signedIn && pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (signedIn) return NextResponse.next();

  // A fetch from the app should get an error it can read, not the HTML of a
  // login page that would blow up as soon as anything called response.json().
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Your session has expired. Reload and sign in." }, {
      status: 401,
    });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}
