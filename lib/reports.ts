import { createClient } from "@/lib/supabase/server";
import { requireRoles } from "@/lib/auth";

export type ReportPeriod = "daily" | "weekly" | "monthly";

export type SalesReportRow = {
  purchase_type?: "customer" | "employee";
  buyer_employee_id?: string | null;
  date: string;
  order_time: string;
  product_or_service: string;
  quantity: number;
  unit_price: number;
  total_sale_value: number;
  payment_method: "cash" | "qr" | "card" | null;
};

const reportViews: Record<ReportPeriod, string> = {
  daily: "v_sales_report_daily",
  weekly: "v_sales_report_weekly",
  monthly: "v_sales_report_monthly",
};

export async function getSalesReport(period: ReportPeriod): Promise<{
  rows: SalesReportRow[];
  error: string | null;
}> {
  await requireRoles(["admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(reportViews[period])
    .select("date, order_time, product_or_service, quantity, unit_price, total_sale_value, payment_method, purchase_type, buyer_employee_id")
    .order("order_time", { ascending: false })
    .order("product_or_service", { ascending: true });

  if (error) return { rows: [], error: error.message };

  return {
    rows: (data ?? []).map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
      total_sale_value: Number(row.total_sale_value),
    })) as SalesReportRow[],
    error: null,
  };
}
