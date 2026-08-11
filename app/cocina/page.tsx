import { KitchenQueue } from "@/components/kitchen/kitchen-queue";
import { getKitchenQueue } from "@/lib/kitchen";

export default async function KitchenPage() {
  const { items, error } = await getKitchenQueue();

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-orange-600">Operación</p>
        <h1 className="text-2xl font-semibold">Cola de cocina</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Prepara los productos de cocina y marca cada ítem cuando esté listo.</p>
      </header>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar la cola: {error}
        </div>
      ) : (
        <KitchenQueue initialItems={items} />
      )}
    </div>
  );
}
