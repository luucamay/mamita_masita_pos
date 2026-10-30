import { KitchenQueue } from "@/components/kitchen/kitchen-queue";
import { getKitchenQueue } from "@/lib/kitchen";

export default async function KitchenPage() {
  const { items, error } = await getKitchenQueue();

  return (
    <div className="px-3 py-3 sm:px-4">
      <header className="mb-2">
        <h1 className="text-xl font-semibold">Cola de cocina</h1>
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
