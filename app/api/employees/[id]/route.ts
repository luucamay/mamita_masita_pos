import { setEmployeeActive } from "@/lib/employees";
import { EmployeeError, isUuid } from "@/lib/employee-provision";
import { employeeBody, employeeFailure, employeeJson } from "@/lib/employee-http";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const value = await employeeBody(request);
    const { id } = await context.params;
    if (!isUuid(id) || typeof value.active !== "boolean" || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) throw new EmployeeError(400, "Revisa el empleado y su estado.");
    return employeeJson({ employee: await setEmployeeActive(id, value.active, value.updatedAt) });
  } catch (error) { return employeeFailure(error); }
}
