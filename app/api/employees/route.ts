import { addEmployee, listEmployees } from "@/lib/employees";
import { employeeBody, employeeFailure, employeeJson } from "@/lib/employee-http";

export const runtime = "nodejs";
export async function GET() {
  try { return employeeJson(await listEmployees()); } catch (error) { return employeeFailure(error); }
}
export async function POST(request: Request) {
  try { return employeeJson(await addEmployee(await employeeBody(request)), 201); } catch (error) { return employeeFailure(error); }
}
