"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  HistoryIcon,
  MenuIcon,
  OrdersIcon,
  SettingsIcon,
} from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/", label: "Menú", icon: MenuIcon },
  { href: "/cocina", label: "Cocina", icon: OrdersIcon },
  { href: "/cafe", label: "Café", icon: OrdersIcon },
  { href: "/pedidos", label: "Pedidos", icon: OrdersIcon },
  { href: "/historial", label: "Historial", icon: HistoryIcon },
  { href: "/menu-admin", label: "Admin menú", icon: SettingsIcon },
];

const roleLabels: Record<string, string> = {
  admin: "Admin",
  barista: "Barista",
  cook: "Cook",
  staff: "Staff",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadRole() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (mounted) setRole(data?.role ?? null);
    }
    void loadRole();
    return () => { mounted = false; };
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  async function handleLogout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="sticky top-0 flex h-screen w-[88px] flex-col items-center gap-3 bg-[var(--sidebar)] px-3 py-5 text-[var(--sidebar-text)]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-lg font-bold">
          MM
        </div>
        {role ? (
          <div
            aria-label={`Rol: ${roleLabels[role] ?? role}`}
            className="mb-2 flex w-full flex-col items-center rounded-xl bg-white/10 px-1 py-2 text-center"
          >
            <span className="text-[9px] uppercase tracking-wider text-white/50">Rol</span>
            <span className="mt-0.5 text-[10px] font-semibold text-white">
              {roleLabels[role] ?? role}
            </span>
          </div>
        ) : null}
        <nav className="flex w-full flex-1 flex-col gap-2">
          {navItems
            .filter((item) => role !== null)
            .filter((item) =>
              role === "barista"
                ? item.href === "/cafe"
                : role === "cook"
                  ? item.href === "/cocina"
                : item.href !== "/menu-admin" || role === "admin",
            )
            .map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[11px] font-medium transition ${
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-xl px-2 py-2 text-[10px] text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Salir
        </button>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
