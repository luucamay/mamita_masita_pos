import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, type UserRole } from "@/lib/permissions";
import { readActiveAccess } from "@/lib/active-access";

export const getActiveAccess = cache(async () => {
  const supabase = await createClient();
  return readActiveAccess({
    subject: async () => { const { data, error } = await supabase.auth.getClaims(); return error ? null : data?.claims.sub ?? null; },
    user: async () => { const { data, error } = await supabase.auth.getUser(); return error ? null : data.user; },
    profile: async id => { const { data, error } = await supabase.from("profiles").select("role,active,full_name,created_at").eq("id", id).maybeSingle(); return error ? null : data; },
  });
});

export async function requireRoles(roles: UserRole[]) {
  const access = await getActiveAccess();
  if (!access) redirect("/login?reason=inactive");
  if (!roles.includes(access.profile.role)) redirect(homeForRole(access.profile.role));
  return access;
}
