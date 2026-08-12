export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-white p-8 text-center shadow-xl shadow-orange-100/40">
        <p className="text-sm font-medium text-orange-600">Mamita Masita</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Página no encontrada</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          La página que buscas no existe o ya no está disponible.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600"
        >
          Volver al inicio
        </a>
      </section>
    </main>
  );
}
