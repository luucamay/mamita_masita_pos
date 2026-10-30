import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isActiveProfile, homeForRole, type UserRole } from "@/lib/permissions";

export const getActiveAccess = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role,active,full_name,created_at").eq("id", data.user.id).maybeSingle();
  if (profileError || !isActiveProfile(profile)) return null;
  return { userId: data.user.id, email: data.user.email ?? "", profile };
});

export async function requireRoles(roles: UserRole[]) {
  const access = await getActiveAccess();
  if (!access) redirect("/login?reason=inactive");
  if (!roles.includes(access.profile.role)) redirect(homeForRole(access.profile.role));
  return access;
}
