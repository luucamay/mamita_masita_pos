// This public channel carries only an invalidation hint, never employee data.
// Receivers always verify their own authenticated access before signing out.
export const ACCESS_CHANNEL = "mamita-access-check";
export const ACCESS_EVENT = "check-access";

export async function notifyAccessChange(client: {
 channel: (name: string) => { httpSend: (event: string, payload: Record<string, never>, options: { timeout: number }) => Promise<unknown> };
}) {
 try { await client.channel(ACCESS_CHANNEL).httpSend(ACCESS_EVENT, {}, {timeout: 2500}); }
 catch { /* Deactivation is already committed. Clients also reconcile periodically. */ }
}
