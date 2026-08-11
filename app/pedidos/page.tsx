import { OrdersList } from "@/components/orders/orders-list";
import { getOpenOrders } from "@/lib/orders";

export default async function PedidosPage() {
  const { orders, error } = await getOpenOrders();

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-orange-600">Operación</p>
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pedidos confirmados y pendientes de entrega.
        </p>
      </header>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error}
        </div>
      ) : (
        <OrdersList orders={orders} />
      )}
    </div>
  );
}
