import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, isActiveProfile } from "@/lib/permissions";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    },
  );

  function redirectTo(url: URL) {
    // NextURL normalizes loopback addresses to localhost. Keep the browser's host,
    // otherwise a 127.0.0.1 redirect loses its host-only authentication cookie.
    const host = request.headers.get("host");
    if (host) url.host = host;
    const redirect = NextResponse.redirect(url);
    // Preserve refreshed session cookies when returning a redirect response.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  const { data } = await supabase.auth.getClaims();
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!data?.claims && !isLoginPage) {
    if (request.nextUrl.pathname === "/api/orders/live") {
      const denied = NextResponse.json({ error: "Sesión no disponible", redirectTo: "/login?reason=inactive" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
      for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
      return denied;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return redirectTo(url);
  }

  // Protected pages and export handlers enforce fresh user/profile permissions
  // through getActiveAccess/requireRoles. Avoid repeating that DB query here.
  // Only /login needs a role lookup to redirect an already signed-in account.
  if (data?.claims && isLoginPage) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", String(data.claims.sub))
      .maybeSingle();

    if (profileError || !isActiveProfile(profile)) {
      return response;
    }
    return redirectTo(new URL(homeForRole(profile.role), request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
