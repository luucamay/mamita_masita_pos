import Link from "next/link";
import { OrdersList } from "@/components/orders/orders-list";
import { getClosedOrders, getOpenOrders } from "@/lib/orders";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view === "closed" ? "closed" : "active";
  const { orders, error } = view === "closed" ? await getClosedOrders() : await getOpenOrders();

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-orange-600">Operación</p>
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {view === "active"
            ? "Pedidos confirmados y pendientes de entrega."
            : "Pedidos pagados y cerrados."}
        </p>
        <nav
          aria-label="Vista de pedidos"
          className="mt-5 flex w-fit rounded-xl border border-[var(--border)] bg-white p-1"
        >
          <Link
            href="/pedidos"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              view === "active" ? "bg-orange-500 text-white" : "text-[var(--muted)] hover:bg-orange-50"
            }`}
            aria-current={view === "active" ? "page" : undefined}
          >
            Activos
          </Link>
          <Link
            href="/pedidos?view=closed"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              view === "closed" ? "bg-orange-500 text-white" : "text-[var(--muted)] hover:bg-orange-50"
            }`}
            aria-current={view === "closed" ? "page" : undefined}
          >
            Cerrados
          </Link>
        </nav>
      </header>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error}
        </div>
      ) : (
        <OrdersList orders={orders} closed={view === "closed"} />
      )}
    </div>
  );
}
