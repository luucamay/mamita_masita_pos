import { CafeQueue } from "@/components/cafe/cafe-queue";
import { getCafeQueue } from "@/lib/cafe";

export default async function CafePage() {
  const { items, error } = await getCafeQueue();

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-orange-600">Operación</p>
        <h1 className="text-2xl font-semibold">Cola de café</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Prepara y entrega únicamente los productos de cafetería.</p>
      </header>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar la cola: {error}
        </div>
      ) : (
        <CafeQueue initialItems={items} />
      )}
    </div>
  );
}
