"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Employee } from "@/lib/employee-provision";
import { Modal } from "@/components/ui/modal";
import { EmployeeSalesPanel } from "./employee-sales-panel";
import { useHeaderRefresh } from "@/lib/use-header-refresh";
import { EMPLOYEE_DOMAIN, employeeEmail, generateEmployeePassword, suggestedLogin } from "@/lib/employee-credentials";
import { CredentialsPanel } from "./credentials-panel";

const roles = { admin: "Administrador", staff: "Atención", cook: "Cocina", barista: "Barista" };
const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-200";
const primary = "min-h-11 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const cardAction = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-2 py-2 text-sm font-semibold disabled:opacity-40";

export function EmployeesPanel({ initialEmployees, actorId, initialError }: { initialEmployees: Employee[]; actorId: string; initialError?: string }) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [ready, setReady] = useState(!initialError);
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [role, setRole] = useState<Employee["role"]>("staff");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [salesEmployee, setSalesEmployee] = useState<Employee | null>(null);
  const [credentialEmployee, setCredentialEmployee] = useState<Employee | null>(null);
  const [knownPasswords, setKnownPasswords] = useState<Record<string, string>>({});
  const [credentialBusy, setCredentialBusy] = useState(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const active = employees.filter((employee) => employee.active).length;
  useEffect(() => { setEmployees(initialEmployees); setReady(!initialError); setError(initialError ?? ""); }, [initialEmployees, initialError]);
  useHeaderRefresh(() => { if (!busy) void load(); });

  async function load() {
    setBusy("load"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/employees", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEmployees(data.employees); setReady(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo actualizar la lista."); }
    finally { setBusy(""); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    let email: string;
    try { email = employeeEmail(username); } catch (failure) { setError((failure as Error).message); return; }
    if (employees.some(employee => employee.email.toLowerCase() === email)) { setError("Ese usuario ya existe. Usa otro, por ejemplo ana2."); return; }
    const fingerprint = JSON.stringify([fullName, email, role, password]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    setBusy("create"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: request.current.id, fullName, email, role, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEmployees((list) => [...list.filter((item) => item.id !== data.employee.id), data.employee]);
      setNotice(data.resumed ? "Alta completada. Se conserva la contraseña establecida en el primer intento." : "Empleado agregado. Ya puede iniciar sesión con su correo y contraseña inicial.");
      if (!data.resumed) setKnownPasswords(current => ({ ...current, [data.employee.id]: password }));
      setCredentialEmployee(data.employee);
      setPassword(""); setFullName(""); setUsername(""); setUsernameTouched(false); setRole("staff"); request.current = null; setShowForm(false); setRoleFilter("all");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo completar el alta. Puedes reintentar."); }
    finally { setBusy(""); }
  }

  async function toggle(employee: Employee) {
    if (busy || !ready || employee.id === actorId) return;
    if (employee.active && !window.confirm(`¿Desactivar el acceso de ${employee.full_name || employee.email}? Su historial se conservará y podrás reactivarlo.`)) return;
    setBusy(employee.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/employees/${employee.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !employee.active, updatedAt: employee.updated_at }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEmployees((list) => list.map((item) => item.id === employee.id ? { ...data.employee, email: employee.email } : item));
      setNotice(data.employee.active ? "Acceso reactivado. Conserva su cuenta y contraseña." : "Acceso desactivado. Su historial se conserva.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo cambiar el acceso."); }
    finally { setBusy(""); }
  }

  function closeForm() { if (!busy) { setShowForm(false); setPassword(""); setShowPassword(false); request.current = null; setError(""); } }
  function generatePassword() {
    setPassword(generateEmployeePassword());
    setShowPassword(true);
  }
  const ordered = employees.filter(e => roleFilter === "all" || e.role === roleFilter).sort((a, b) => Object.keys(roles).indexOf(a.role) - Object.keys(roles).indexOf(b.role) || Number(b.active) - Number(a.active) || (a.full_name || a.email).localeCompare(b.full_name || b.email, "es"));
  return <div className="mx-auto w-full max-w-6xl space-y-3 px-3 py-3 sm:px-5">
    <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Empleados</h1><div className="flex gap-2"><button type="button" disabled={!ready || !!busy} onClick={() => { setShowForm(true); setError(""); setPassword(""); setShowPassword(false); request.current = null; }} className={primary}>Agregar empleado</button></div></header>
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--muted)]">{employees.length} empleados · {active} activos · {employees.length - active} inactivos</p><Link href="/compras-empleados" className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-800">Cobros del equipo</Link></div>
    {!showForm && error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}
    <Modal open={showForm && ready} title="Nuevo empleado" onClose={closeForm} busy={!!busy}>
      {error ? <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <form aria-label="Agregar empleado" onSubmit={create} className="space-y-3">
        <label className="block text-sm font-medium">Nombre completo<input autoComplete="off" required minLength={2} maxLength={100} value={fullName} onChange={event => { setFullName(event.target.value); if (!usernameTouched) setUsername(suggestedLogin(event.target.value)); }} disabled={!!busy} className={field}/></label>
        <div><label htmlFor="employee-username" className="text-sm font-medium">Usuario de acceso</label><div className="mt-1 flex items-center overflow-hidden rounded-xl border border-[var(--border)] bg-white focus-within:ring-2 focus-within:ring-orange-200"><input id="employee-username" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} value={username} onChange={event => { setUsername(event.target.value.toLowerCase()); setUsernameTouched(true); }} disabled={!!busy} className="min-h-11 min-w-0 flex-1 px-3 text-base outline-none" placeholder="ana" aria-describedby="employee-email-help"/><span className="pr-3 text-sm text-[var(--muted)]">{EMPLOYEE_DOMAIN}</span></div></div>
        <p id="employee-email-help" className="text-xs text-[var(--muted)]">Solo escribe el usuario, por ejemplo ana. Es un acceso interno, sin Google ni casilla de correo.</p>
        <label className="block text-sm font-medium">Rol<select aria-label="Rol" value={role} onChange={event => setRole(event.target.value as Employee["role"])} disabled={!!busy} className={field}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div><label htmlFor="employee-password" className="text-sm font-medium">Contraseña inicial</label><input id="employee-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={!!busy} aria-describedby="password-help" className={field}/>
        <div className="flex items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} className="h-4 w-4 accent-orange-600"/>Mostrar contraseña</label><button type="button" disabled={!!busy} onClick={generatePassword} className="min-h-11 px-2 text-xs font-semibold text-orange-800">Generar contraseña</button></div>
        <p id="password-help" className="text-xs leading-5 text-[var(--muted)]">12–128 caracteres, letras y números. Después del alta podrás copiar las credenciales.</p></div>
        <div className="flex justify-end gap-2"><button type="button" disabled={!!busy} onClick={closeForm} className={secondary}>Cancelar</button><button type="submit" disabled={!!busy} className={primary}>{busy === "create" ? "Creando acceso…" : "Crear acceso"}</button></div>
      </form>
    </Modal>
    {ready ? <>
      <div role="group" aria-label="Filtrar empleados por rol" className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-white p-1">{[["all", "Todos"], ...Object.entries(roles)].map(([value, label]) => <button type="button" key={value} aria-pressed={roleFilter === value} onClick={() => setRoleFilter(value)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${roleFilter === value ? "bg-orange-500 text-white" : "text-[var(--muted)] hover:bg-orange-50"}`}>{label}<span className="ml-1.5 text-xs opacity-80">{value === "all" ? employees.length : employees.filter(e => e.role === value).length}</span></button>)}</div>
      {!ordered.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">No hay empleados en este grupo.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ordered.map(employee => <article key={employee.id} aria-label={employee.full_name || employee.email} className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-3">
        <div className="flex items-start gap-3"><span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-900">{(employee.full_name || employee.email).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span><div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold">{employee.full_name || "Sin nombre"}{employee.id === actorId ? <span className="ml-2 text-xs font-normal text-[var(--muted)]">Tú</span> : null}</h2><p className="mt-0.5 break-all text-xs text-[var(--muted)]">{employee.email || "Correo no disponible"}</p><p className="mt-1 text-xs text-orange-800">{roles[employee.role]} · <span className={employee.active ? "text-emerald-800" : "text-stone-600"}>{employee.active ? "Activo" : "Inactivo"}</span></p></div><button type="button" onClick={() => setCredentialEmployee(employee)} aria-label={`Ver credenciales de ${employee.full_name || employee.email}`} title="Ver o copiar credenciales" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-orange-800 hover:bg-orange-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="h-5 w-5"><circle cx="8" cy="9" r="4"/><path d="m11 12 9 9M16 17l3-3M13 14l3-3"/></svg></button></div>
        <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setSalesEmployee(employee)} className={cardAction}>Historial de ventas</button><button type="button" disabled={!!busy || employee.id === actorId} onClick={() => void toggle(employee)} className={`${cardAction} ${employee.active ? "text-red-700" : "text-emerald-800"}`} title={employee.id === actorId ? "Tu acceso debe mantenerse activo." : undefined}>{busy === employee.id ? "Guardando…" : employee.active ? "Desactivar acceso" : "Reactivar acceso"}</button></div>
      </article>)}</div>}
    </> : null}
    <Modal open={salesEmployee !== null} title={`Ventas de ${salesEmployee?.full_name || salesEmployee?.email || "empleado"}`} onClose={() => setSalesEmployee(null)} wide>{salesEmployee ? <EmployeeSalesPanel key={salesEmployee.id} employee={salesEmployee}/> : null}</Modal>
    <Modal open={credentialEmployee !== null} title="Credenciales de acceso" busy={credentialBusy} onClose={() => { if (!credentialBusy) setCredentialEmployee(null); }}>{credentialEmployee ? <CredentialsPanel key={credentialEmployee.id} employee={credentialEmployee} actorId={actorId} initialPassword={knownPasswords[credentialEmployee.id]} onSaved={password => setKnownPasswords(current => ({ ...current, [credentialEmployee.id]: password }))} onBusyChange={setCredentialBusy}/> : null}</Modal>
  </div>;
}
