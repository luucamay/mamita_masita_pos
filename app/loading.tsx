export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="px-6 py-8 lg:px-8">
      <p className="text-lg font-semibold text-[var(--ink)]">Cargando…</p>
      <p className="mt-2 text-sm text-[var(--muted)]">Consultando datos actualizados.</p>
    </div>
  );
}
