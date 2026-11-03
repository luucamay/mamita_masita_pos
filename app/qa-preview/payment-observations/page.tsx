import {notFound} from "next/navigation";
import {requireRoles} from "@/lib/auth";
import {ReportView} from "@/components/reports/report-view";
import {CashShiftCard} from "@/components/cashbox/cash-history";
import {qaCashContext} from "@/lib/qa-cashbox-fixture";
import type {SalesReport} from "@/lib/report-contract";
export default async function QaObservations(){
 if(process.env.MAMITA_QA_BUILD!=="true")notFound();
 await requireRoles(["admin"]);
 const context=qaCashContext("pending");
 context.receipts[0].observation='<script>no ejecutar</script> · Producto sustituido por la promoción';
 context.shift!.closing_snapshot=context.receipts;context.shift!.close_note="QR no recibido: revisar con la dueña.";
 const report:SalesReport={range:{period:"daily",date:"2026-10-30",start_date:"2026-10-30",end_date_exclusive:"2026-10-31",time_zone:"America/La_Paz"},filters:{payment:"all",purchase:"all"},summary:{total:70,orders:2,units:2,cash:{amount:50,orders:1},qr:{amount:20,orders:1},other:{amount:0,orders:0}},filtered:{total:70,orders:2,units:2},rows:[{date:"2026-10-30",product_or_service:"Producto QA",quantity:2,unit_price:35,total_sale_value:70,payment_method:"cash",purchase_type:"customer"}],observations:context.receipts.filter(r=>r.observation)};
 return <><ReportView report={report} filters={{period:"daily",date:"2026-10-30",payment:"all",purchase:"all"}}/><div className="mx-auto max-w-6xl p-3"><CashShiftCard shift={context.shift!}/></div></>;
}
