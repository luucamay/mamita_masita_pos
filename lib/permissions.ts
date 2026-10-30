export type UserRole = "admin" | "staff" | "cook" | "barista";
export type AccessProfile = { role: UserRole; active: boolean };

export function isActiveProfile(value: unknown): value is AccessProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return profile.active === true && typeof profile.role === "string" && ["admin", "staff", "cook", "barista"].includes(profile.role);
}

export function homeForRole(role: UserRole): string {
  return role === "cook" ? "/cocina" : role === "barista" ? "/cafe" : "/";
}

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function canAccessPath(profile: unknown, pathname: string): boolean {
  if (!isActiveProfile(profile)) return false;
  if(isWithin(pathname,"/perfil"))return true;
  if(isWithin(pathname,"/compras-empleados"))return profile.role==="admin"||profile.role==="staff";
  if (isWithin(pathname, "/historial") || isWithin(pathname, "/menu-admin") || isWithin(pathname, "/empleados") || isWithin(pathname, "/promociones")) return profile.role === "admin";
  if (profile.role === "cook") return isWithin(pathname, "/cocina");
  if (profile.role === "barista") return isWithin(pathname, "/cafe");
  return ["/", "/pedidos", "/cafe", "/cocina"].some((path) => isWithin(pathname, path));
}

// A login redirect must stay within the application's known, permitted routes.
export function safeLoginDestination(value: string | null, profile: AccessProfile): string {
  const fallback = homeForRole(profile.role);
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://mamita.invalid");
    if (url.origin !== "https://mamita.invalid" || !canAccessPath(profile, url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
