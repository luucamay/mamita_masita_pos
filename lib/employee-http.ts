import { NextResponse } from "next/server";
import { EmployeeError } from "@/lib/employee-provision";

export const employeeJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export function employeeFailure(error: unknown) {
  return employeeJson({ error: error instanceof EmployeeError ? error.message : "No se pudo completar la operación. Intenta nuevamente." }, error instanceof EmployeeError ? error.status : 503);
}
export async function employeeBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new EmployeeError(403, "Origen de solicitud no permitido.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new EmployeeError(415, "Se requiere una solicitud JSON.");
  if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new EmployeeError(413, "Solicitud demasiado grande.");
  const raw = await request.text();
  if (raw.length > 8192) throw new EmployeeError(413, "Solicitud demasiado grande.");
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new EmployeeError(400, "Solicitud inválida."); }
}
