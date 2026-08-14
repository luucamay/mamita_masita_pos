"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    const next = new URL(window.location.href).searchParams.get("next") || "/";
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-white p-7 shadow-xl shadow-orange-100/40 sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-sm ring-1 ring-[var(--border)]">
            <img
              src="/icons/icon-192.png"
              alt="Mamita Masita"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-orange-600">Mamita Masita</p>
            <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          </div>
        </div>

        <p className="mb-6 text-sm leading-6 text-[var(--muted)]">
          Ingresa con tu cuenta del equipo para acceder al menú y gestionar pedidos.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium">
            Correo electrónico
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@mamita.local"
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-3.5 py-3 outline-none ring-orange-200 transition focus:ring-4"
            />
          </label>

          <label className="block text-sm font-medium">
            Contraseña
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] px-3.5 py-3 outline-none ring-orange-200 transition focus:ring-4"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-orange-500 px-4 py-3.5 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Acceso privado para el equipo de Mamita Masita
        </p>
      </section>
    </main>
  );
}
