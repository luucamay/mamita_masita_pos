import type { UserRole } from "./permissions";

export type Employee = { id: string; full_name: string | null; email: string; role: UserRole; active: boolean; updated_at: string };
export type EmployeeInput = { requestId: string; email: string; fullName: string; role: UserRole; password: string };
export type Provision = { request_id: string; email: string; full_name: string; role: UserRole; actor_id: string; completed: boolean; auth_user_id: string | null };
export type AuthIdentity = { id: string; email?: string; app_metadata: Record<string, unknown> };
export class EmployeeError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function employeeInput(value: unknown): EmployeeInput {
  if (!value || typeof value !== "object") throw new EmployeeError(400, "Datos inválidos.");
  const v = value as Record<string, unknown>;
  const email = typeof v.email === "string" ? v.email.trim().toLowerCase() : "";
  const fullName = typeof v.fullName === "string" ? v.fullName.trim() : "";
  if (!isUuid(v.requestId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || fullName.length < 2 || fullName.length > 100 || /[\u0000-\u001f\u007f]/.test(fullName)
    || !["admin", "staff", "cook", "barista"].includes(String(v.role)) || typeof v.password !== "string" || v.password.length < 12 || v.password.length > 128 || !/[a-zA-Z]/.test(v.password) || !/[0-9]/.test(v.password)) {
    throw new EmployeeError(400, "Revisa los datos. La contraseña debe tener de 12 a 128 caracteres, letras y números.");
  }
  return { requestId: v.requestId, email, fullName, role: v.role as UserRole, password: v.password };
}

type Dependencies = {
  reserve: (input: EmployeeInput) => Promise<Provision>;
  find: (email: string) => Promise<AuthIdentity | null>;
  create: (input: EmployeeInput, requestId: string) => Promise<AuthIdentity>;
  complete: (requestId: string, userId: string) => Promise<Omit<Employee, "email">>;
};

// No password is persisted in the reservation. Never adopt or overwrite an unrelated identity.
export async function provisionEmployee(input: EmployeeInput, deps: Dependencies) {
  const reservation = await deps.reserve(input);
  let identity: AuthIdentity | null = null;
  let resumed = reservation.request_id !== input.requestId;
  if (reservation.completed && reservation.auth_user_id) {
    identity = { id: reservation.auth_user_id, app_metadata: {} };
    resumed = true;
  } else {
    identity = await deps.find(reservation.email);
    if (identity) resumed = true;
    if (!identity) {
      try { identity = await deps.create(input, reservation.request_id); }
      catch {
        // Auth may have committed even when its HTTP response was lost.
        identity = await deps.find(reservation.email);
        if (!identity) throw new EmployeeError(503, "No se pudo confirmar el acceso. Reintenta con los mismos datos; el alta quedó registrada para recuperación.");
        resumed = true;
      }
    }
    if (identity.app_metadata.mamita_employee_request !== reservation.request_id) throw new EmployeeError(409, "Ese correo ya pertenece a otra cuenta. No se modificó su acceso.");
  }
  try {
    const profile = await deps.complete(reservation.request_id, identity.id);
    return { employee: { ...profile, email: reservation.email }, resumed };
  } catch {
    throw new EmployeeError(503, "El acceso está registrado, pero falta completar el perfil. Reintenta con los mismos datos y la contraseña del primer intento.");
  }
}
