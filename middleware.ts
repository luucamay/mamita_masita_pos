import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const { data } = await supabase.auth.getClaims();
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!data?.claims && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (data?.claims && isLoginPage) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", String(data.claims.sub))
      .maybeSingle();
    const destination =
      profile?.role === "barista"
        ? "/cafe"
        : profile?.role === "cook"
          ? "/cocina"
          : "/";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (data?.claims) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", String(data.claims.sub))
      .maybeSingle();

    if (profile?.role === "barista" && request.nextUrl.pathname !== "/cafe") {
      return NextResponse.redirect(new URL("/cafe", request.url));
    }

    if (profile?.role === "cook" && request.nextUrl.pathname !== "/cocina") {
      return NextResponse.redirect(new URL("/cocina", request.url));
    }

    if (
      request.nextUrl.pathname.startsWith("/menu-admin") &&
      (profile?.role !== "admin" || profile.active !== true)
    ) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
