import { isActiveProfile, type AccessProfile } from "./permissions.ts";

type Profile = AccessProfile & { full_name: string; created_at: string };
export async function readActiveAccess(source: {
  subject: () => Promise<string | null>;
  user: () => Promise<{ id: string; email?: string } | null>;
  profile: (id: string) => Promise<unknown>;
}) {
  // Verified JWT supplies only the lookup ID. Fresh Auth and profile reads still
  // decide access, and must agree on identity before returning any private data.
  const subject = await source.subject();
  if (!subject) return null;
  const [user, profile] = await Promise.all([source.user(), source.profile(subject)]);
  if (!user || user.id !== subject || !isActiveProfile(profile)) return null;
  return { userId: user.id, email: user.email ?? "", profile: profile as Profile };
}
