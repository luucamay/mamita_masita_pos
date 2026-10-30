import { resetEmployeePassword } from "@/lib/employees";
import { employeeBody, employeeFailure, employeeJson } from "@/lib/employee-http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return employeeJson(await resetEmployeePassword((await params).id, await employeeBody(request))); }
  catch (error) { return employeeFailure(error); }
}
