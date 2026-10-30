import { employeeContext } from "@/lib/employees";
import { EmployeeError, isUuid } from "@/lib/employee-provision";
import { employeeFailure, employeeJson } from "@/lib/employee-http";
import { normalizeEmployeeSales, validSalesRange } from "@/lib/employee-sales";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client } = await employeeContext();
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => query.getAll(key).length !== 1)) throw new EmployeeError(400, "Filtros duplicados.");
    const start = query.get("start"), end = query.get("end"), page = query.get("page") ?? "0";
    if (!isUuid(id) || !/^(0|[1-9]\d{0,5})$/.test(page) || Number(page) > 100000 || (start !== null || end !== null) && (!start || !end || !validSalesRange(start, end))) throw new EmployeeError(400, "Revisa el empleado y las fechas (máximo 366 días).");
    const { data, error } = await client.rpc("admin_employee_sales_history", { p_employee_id: id, p_start: start, p_end: end, p_page: Number(page) });
    if (error) throw new EmployeeError(error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503, error.code === "22023" ? "Revisa el empleado y las fechas." : "No se pudo cargar el historial. Intenta nuevamente.");
    return employeeJson(normalizeEmployeeSales(data));
  } catch (error) { return employeeFailure(error); }
}
