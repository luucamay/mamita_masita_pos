"use client";
import { useRef, useState } from "react";
import type { Employee } from "@/lib/employee-provision";
import { credentialsMessage, generateEmployeePassword } from "@/lib/employee-credentials";

export function CredentialsPanel({ employee, actorId, initialPassword, onSaved, onBusyChange }: { employee: Employee; actorId: string; initialPassword?: string; onSaved: (password: string) => void; onBusyChange: (busy: boolean) => void }) {
  const [password, setPassword] = useState(initialPassword ?? ""), [visible, setVisible] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const operation = useRef<{ id: string; password: string } | null>(null);
  async function reset() {
    if (busy) return;
    operation.current ??= { id: crypto.randomUUID(), password: generateEmployeePassword() };
    // An uncertain reset must never leave a previously cached password shareable.
    setPassword(""); onSaved(""); setVisible(false);
    setBusy(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/employees/${employee.id}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: operation.current.id, password: operation.current.password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo cambiar la contraseña. Reintenta la misma operación.");
      const value = operation.current.password;
      setPassword(value); setVisible(false); setConfirm(false); onSaved(value); operation.current = null;
      setNotice("Nueva contraseña creada. La anterior dejó de servir para iniciar sesión.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo confirmar el cambio. Reintenta."); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function copy() {
    setError(""); setNotice("");
    try { await navigator.clipboard.writeText(password ? credentialsMessage(employee.email, password) : employee.email); setNotice(password ? "Credenciales copiadas. Compártelas por un canal privado." : "Usuario copiado."); }
    catch { setError("No se pudo copiar. Puedes seleccionar los datos y copiarlos manualmente."); }
  }
  return <div className="space-y-3">
    <p className="text-sm font-semibold">{employee.full_name || employee.email}</p>
    <label className="block text-xs text-[var(--muted)]">Usuario<input readOnly value={employee.email} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-[var(--ink)]"/></label>
    {password ? <><label htmlFor="shared-password" className="block text-xs text-[var(--muted)]">Contraseña</label><div className="flex items-center rounded-xl border border-[var(--border)] bg-white"><input id="shared-password" readOnly type={visible ? "text" : "password"} value={password} autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm"/><button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? "Ocultar contraseña" : "Ver contraseña"} className="flex h-11 w-11 items-center justify-center text-orange-800"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className="h-5 w-5"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible ? <path d="m3 3 18 18"/> : null}</svg></button></div><p className="text-xs text-[var(--muted)]">Disponible durante esta vista. Al recargar, la contraseña no se puede recuperar.</p></> : <p className="text-xs leading-5 text-[var(--muted)]">Las contraseñas existentes no se pueden consultar. Puedes generar una nueva para entregar el acceso.</p>}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}{notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}
    <button type="button" onClick={() => void copy()} disabled={busy} className="min-h-11 w-full rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-40">{password ? "Copiar credenciales" : "Copiar usuario"}</button>
    {employee.id !== actorId ? confirm ? <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-3"><p className="text-sm">Se reemplazará la contraseña de {employee.full_name || employee.email}. Entrégale la nueva para su próximo inicio de sesión.</p><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => { setConfirm(false); operation.current = null; }} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm">Cancelar cambio</button><button type="button" disabled={busy} onClick={() => void reset()} className="min-h-11 rounded-xl bg-orange-600 px-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Cambiando…" : "Confirmar nueva contraseña"}</button></div></div> : <button type="button" onClick={() => setConfirm(true)} className="min-h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-orange-800">Generar nueva contraseña</button> : <p className="text-xs text-[var(--muted)]">Desde esta pantalla puedes cambiar la contraseña de las otras cuentas del equipo.</p>}
  </div>;
}
