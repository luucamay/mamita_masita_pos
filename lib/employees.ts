import "server-only";
import { getActiveAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, passwordRequestFingerprint } from "@/lib/supabase/admin";
import { EmployeeError, employeeInput, isUuid, provisionEmployee, type Employee, type AuthIdentity } from "@/lib/employee-provision";

function rpcFailure(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new EmployeeError(403, "No tienes permiso para esta operación.");
  if (error.code === "23505") throw new EmployeeError(409, "Ya existe un alta para ese correo. Revisa los empleados registrados.");
  if (error.code === "40001") throw new EmployeeError(409, "El perfil cambió. Actualiza la lista antes de continuar.");
  if (error.code === "P0001") throw new EmployeeError(409, "No se puede desactivar esta cuenta. Debe conservarse el acceso del administrador.");
  if (error.code === "22023") throw new EmployeeError(400, "Revisa los datos de la operación.");
  throw new EmployeeError(503, "La administración de empleados todavía no está habilitada o no responde. Intenta actualizar más tarde.");
}

export async function employeeContext() {
  const access = await getActiveAccess();
  if (!access) throw new EmployeeError(401, "Inicia sesión con una cuenta activa.");
  if (access.profile.role !== "admin") throw new EmployeeError(403, "Solo el administrador puede gestionar empleados.");
  const client = await createClient();
  const { data, error } = await client.rpc("admin_employee_context");
  rpcFailure(error);
  if (data?.version !== 1 || data.actor_id !== access.userId) throw new EmployeeError(503, "La administración de empleados todavía no está habilitada.");
  // Deliberately before constructing a privileged client or listing Auth emails.
  return { client, actorId: access.userId };
}

async function identities(admin: ReturnType<typeof createAdminClient>): Promise<AuthIdentity[]> {
  const result: AuthIdentity[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new EmployeeError(503, "No se pudo consultar el directorio de accesos.");
    result.push(...data.users);
    if (data.users.length < 100) return result;
  }
  throw new EmployeeError(503, "No se pudo completar la consulta del directorio.");
}

export async function listEmployees() {
  const { client, actorId } = await employeeContext();
  const admin = createAdminClient();
  const [users, profiles] = await Promise.all([identities(admin), client.from("profiles").select("id,full_name,role,active,updated_at").order("full_name")]);
  if (profiles.error) throw new EmployeeError(503, "No se pudieron consultar los perfiles.");
  const emails = new Map(users.map((user) => [user.id, user.email ?? ""]));
  return { actorId, employees: (profiles.data ?? []).map((profile) => ({ ...profile, email: emails.get(profile.id) ?? "" })) as Employee[] };
}

export async function addEmployee(value: unknown) {
  const { client } = await employeeContext();
  const input = employeeInput(value);
  const admin = createAdminClient();
  return provisionEmployee(input, {
    reserve: async (form) => {
      const { data, error } = await client.rpc("admin_prepare_employee", { p_request_id: form.requestId, p_email: form.email, p_full_name: form.fullName, p_role: form.role });
      rpcFailure(error); return data;
    },
    find: async (email) => (await identities(admin)).find((user) => user.email?.toLowerCase() === email) ?? null,
    create: async (form, requestId) => {
      const { data, error } = await admin.auth.admin.createUser({ email: form.email, password: form.password, email_confirm: true, app_metadata: { mamita_employee_request: requestId }, user_metadata: { full_name: form.fullName } });
      if (error || !data.user) throw new Error("Auth creation failed");
      return data.user;
    },
    complete: async (requestId, userId) => {
      const { data, error } = await client.rpc("admin_complete_employee", { p_request_id: requestId, p_user_id: userId });
      rpcFailure(error); return data;
    },
  });
}

export async function setEmployeeActive(id: string, active: boolean, updatedAt: string) {
  const { client } = await employeeContext();
  const { data, error } = await client.rpc("admin_set_employee_active", { p_employee_id: id, p_active: active, p_expected_updated_at: updatedAt });
  rpcFailure(error); return data;
}

export async function resetEmployeePassword(id: string, value: Record<string, unknown>) {
  const { client, actorId } = await employeeContext();
  if (!isUuid(id) || id === actorId || !isUuid(value.requestId) || typeof value.password !== "string" || value.password.length < 12 || value.password.length > 128 || !/[a-zA-Z]/.test(value.password) || !/[0-9]/.test(value.password)) throw new EmployeeError(400, "Revisa la cuenta y la contraseña inicial.");
  const fingerprint = passwordRequestFingerprint(id, value.requestId, value.password);
  const prepared = await client.rpc("admin_prepare_password_reset", { p_request: value.requestId, p_employee: id, p_fingerprint: fingerprint });
  rpcFailure(prepared.error);
  const admin = createAdminClient();
  const found = await admin.auth.admin.getUserById(id);
  if (found.error || !found.data.user) throw new EmployeeError(503, "No se pudo verificar la cuenta. Reintenta la misma operación.");
  let user = found.data.user;
  const alreadyApplied = user.app_metadata.mamita_password_reset_request === value.requestId;
  if (prepared.data?.status === "completed" && !alreadyApplied) throw new EmployeeError(409, "La contraseña cambió después de esta operación. Genera una nueva.");
  if (!alreadyApplied) {
    // Recheck the live administrator after reading Auth, before the privileged write.
    await employeeContext();
    const changed = await admin.auth.admin.updateUserById(id, { password: value.password, app_metadata: { ...user.app_metadata, mamita_password_reset_request: value.requestId } });
    if (changed.error || !changed.data.user) throw new EmployeeError(503, "No se pudo confirmar el cambio. Reintenta la misma operación sin generar otra contraseña.");
    user = changed.data.user;
  }
  const completed = await client.rpc("admin_complete_password_reset", { p_request: value.requestId });
  rpcFailure(completed.error);
  return { employee: { id, email: user.email ?? "" }, resumed: alreadyApplied };
}
