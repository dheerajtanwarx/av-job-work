import { NextResponse, type NextRequest } from "next/server";

/** Public pages reachable without a session: the read-only QR challan view (`/c/<token>`). */
const isPublic = (pathname: string) => /^\/c\/[^/]+\/?$/.test(pathname);

/** Send visitors without a session cookie straight to /login (the API still verifies the token). */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || isPublic(pathname) || req.cookies.has("av_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};
