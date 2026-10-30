import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { join } from "node:path";
import { EmployeeError } from "@/lib/employee-provision";
import { createHmac } from "node:crypto";

function adminKey() {
  let key = process.env.SUPABASE_SECRET_KEY;
  // Explicit local-only fallback; Next does not automatically load this private file.
  if (!key && (process.env.NODE_ENV === "development" || process.env.MAMITA_QA_BUILD === "true")) {
    try { key = parseEnv(readFileSync(join(process.cwd(), ".env.admin.local"), "utf8")).SUPABASE_SECRET_KEY; } catch { /* Configuration is reported without exposing its contents. */ }
  }
  if (!key) throw new EmployeeError(503, "El servicio administrativo todavía no está configurado.");
  return key;
}
export function passwordRequestFingerprint(employeeId: string, requestId: string, password: string) {
  return createHmac("sha256", adminKey()).update(JSON.stringify([employeeId, requestId, password])).digest("hex");
}
export function createAdminClient() {
  const key = adminKey();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
