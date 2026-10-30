import { notFound } from "next/navigation";
import { requireRoles } from "@/lib/auth";
import { OrdersList } from "@/components/orders/orders-list";
import { qaOrderCatalog, qaOrderSnapshot } from "@/lib/qa-order-fixture";

export default async function QaOrdersPage({searchParams}:{searchParams:Promise<{prepaid?:string}>}) {
  if (process.env.MAMITA_QA_BUILD !== "true") notFound();
  await requireRoles(["admin", "staff"]);
  const snapshot=qaOrderSnapshot();
  if((await searchParams).prepaid==="1"){snapshot.order.paid_at="2026-10-29T12:00:01Z";snapshot.order.payment_method="cash";snapshot.order.payment_methods=["cash"];snapshot.order.table_number="Para llevar";}
  return <div className="p-3"><h1 className="mb-2 text-xl font-semibold">Pedido ficticio de verificación</h1><OrdersList orders={[snapshot.order]} testCatalog={qaOrderCatalog} /></div>;
}
