import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // If Supabase is unreachable (e.g. screenshot bot, cold start),
    // fall through and let the redirect handle it gracefully.
  }

  const path = request.nextUrl.pathname;
  const search = request.nextUrl.search; // includes leading "?" or ""
  const isAuthPage = path === "/login" || path === "/signup";
  const isProtected =
    path === "/" ||
    path.startsWith("/trips") ||
    path.startsWith("/join") ||
    path.startsWith("/admin") ||
    path.startsWith("/account");

  // Only forward internal paths to ?next. Rejects anything that could be
  // weaponised to bounce the user off the app post-login.
  function safeNext(target: string | null): string {
    if (!target) return "/";
    if (!target.startsWith("/") || target.startsWith("//")) return "/";
    return target;
  }

  // Not logged in + hitting a protected page → bounce to /login with ?next
  // so the user lands back where they were trying to go after auth.
  // Without this, an invite link like /join/XYZ dropped users on / after
  // login and they had to tap the link a second time.
  if (!user && isProtected) {
    const next = encodeURIComponent(`${path}${search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }

  // Already logged in + on /login or /signup → bounce them to ?next if
  // present (e.g. they were redirected here mid-invite flow and the auth
  // cookie was set by another tab), otherwise home.
  if (user && isAuthPage) {
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|api).*)"],
};
