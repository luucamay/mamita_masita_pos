import Link from "next/link";
import { LiveOrders } from "@/components/orders/live-orders";
import { getOrderBoard } from "@/lib/order-board-data";
import { parseBoardPage } from "@/lib/order-board";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const query=await searchParams;
  const view = query.view === "closed" ? "closed" : "active";
  let page=1,invalid=false;try{page=parseBoardPage(query.page,view==="closed");}catch{invalid=true;}
  const { board, error } = await getOrderBoard(view === "closed",null,page);

  return (
    <div className="px-6 py-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {view === "active"
            ? "Pedidos en vivo, productos y tiempo desde que se abrió la cuenta."
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
      {invalid ? <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-900">Página inválida. Se muestra la primera página.</p> : null}
      {error || !board ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar los pedidos: {error}
        </div>
      ) : (
        <LiveOrders key={`${view}-${page}`} initial={board} closed={view === "closed"} page={page}/>
      )}
    </div>
  );
}
