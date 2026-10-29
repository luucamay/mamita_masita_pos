import { notFound } from "next/navigation";
import { requireRoles } from "@/lib/auth";
import { OrdersList } from "@/components/orders/orders-list";
import { qaOrderCatalog, qaOrderSnapshot } from "@/lib/qa-order-fixture";

export default async function QaOrdersPage() {
  if (process.env.MAMITA_QA_BUILD !== "true") notFound();
  await requireRoles(["admin", "staff"]);
  return <div className="p-5"><h1 className="mb-4 text-2xl font-semibold">Pedido ficticio de verificación</h1><OrdersList orders={[qaOrderSnapshot().order]} testCatalog={qaOrderCatalog} /></div>;
}
