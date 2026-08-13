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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    async function loadRole() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (mounted) setRole(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (mounted) setRole(data?.role ?? null);
    }

    void loadRole();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      if (mounted) setRole(null);
      setTimeout(() => {
        if (mounted) void loadRole();
      }, 0);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
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
      {mobileMenuOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      ) : null}
      <aside
        id="mobile-navigation"
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[88px] flex-col items-center gap-3 bg-[var(--sidebar)] px-3 py-5 text-[var(--sidebar-text)] transition-transform md:sticky md:inset-y-auto md:top-0 md:z-auto md:translate-x-0 md:transition-none ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
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
                  onClick={() => setMobileMenuOpen(false)}
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
          onClick={() => {
            setMobileMenuOpen(false);
            void handleLogout();
          }}
          className="rounded-xl px-2 py-2 text-[10px] text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Salir
        </button>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="flex items-center border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:hidden">
          <button
            type="button"
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen(true)}
            className="rounded-lg p-2 text-[var(--ink)] hover:bg-[var(--bg)]"
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          <span className="ml-2 text-sm font-semibold">Mamita Masita</span>
        </header>
        {children}
      </main>
    </div>
  );
}
