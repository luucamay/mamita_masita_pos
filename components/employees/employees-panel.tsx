"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Employee } from "@/lib/employee-provision";
import { Modal } from "@/components/ui/modal";
import { EmployeeSalesPanel } from "./employee-sales-panel";
import { useHeaderRefresh } from "@/lib/use-header-refresh";

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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Employee["role"]>("staff");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [salesEmployee, setSalesEmployee] = useState<Employee | null>(null);
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
    const fingerprint = JSON.stringify([fullName, email, role, password]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    setBusy("create"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: request.current.id, fullName, email, role, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEmployees((list) => [...list.filter((item) => item.id !== data.employee.id), data.employee]);
      setNotice(data.resumed ? "Alta completada. Se conserva la contraseña establecida en el primer intento." : "Empleado agregado. Ya puede iniciar sesión con su correo y contraseña inicial.");
      setPassword(""); setFullName(""); setEmail(""); setRole("staff"); request.current = null; setShowForm(false); setRoleFilter("all");
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
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    setPassword(Array.from(crypto.getRandomValues(new Uint8Array(18)), n => alphabet[n & 63]).join("") + "7a");
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
        <label className="block text-sm font-medium">Nombre completo<input autoComplete="off" required minLength={2} maxLength={100} value={fullName} onChange={event => setFullName(event.target.value)} disabled={!!busy} className={field}/></label>
        <label className="block text-sm font-medium">Correo de acceso<input type="email" autoComplete="off" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={!!busy} className={field} aria-describedby="employee-email-help"/></label>
        <p id="employee-email-help" className="text-xs text-[var(--muted)]">Puede ser un correo del negocio. Esta opción crea el acceso a la app, no una casilla de correo.</p>
        <label className="block text-sm font-medium">Rol<select aria-label="Rol" value={role} onChange={event => setRole(event.target.value as Employee["role"])} disabled={!!busy} className={field}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div><label htmlFor="employee-password" className="text-sm font-medium">Contraseña inicial</label><input id="employee-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={!!busy} aria-describedby="password-help" className={field}/>
        <div className="flex items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} className="h-4 w-4 accent-orange-600"/>Mostrar contraseña</label><button type="button" disabled={!!busy} onClick={generatePassword} className="min-h-11 px-2 text-xs font-semibold text-orange-800">Generar contraseña</button></div>
        <p id="password-help" className="text-xs leading-5 text-[var(--muted)]">12–128 caracteres, letras y números. Entrégala por un canal privado; no se envía por correo.</p></div>
        <div className="flex justify-end gap-2"><button type="button" disabled={!!busy} onClick={closeForm} className={secondary}>Cancelar</button><button type="submit" disabled={!!busy} className={primary}>{busy === "create" ? "Creando acceso…" : "Crear acceso"}</button></div>
      </form>
    </Modal>
    {ready ? <>
      <div role="group" aria-label="Filtrar empleados por rol" className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-white p-1">{[["all", "Todos"], ...Object.entries(roles)].map(([value, label]) => <button type="button" key={value} aria-pressed={roleFilter === value} onClick={() => setRoleFilter(value)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${roleFilter === value ? "bg-orange-500 text-white" : "text-[var(--muted)] hover:bg-orange-50"}`}>{label}<span className="ml-1.5 text-xs opacity-80">{value === "all" ? employees.length : employees.filter(e => e.role === value).length}</span></button>)}</div>
      {!ordered.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">No hay empleados en este grupo.</p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{ordered.map(employee => <article key={employee.id} aria-label={employee.full_name || employee.email} className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-3">
        <div className="flex items-start gap-3"><span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-900">{(employee.full_name || employee.email).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</span><div className="min-w-0 flex-1"><h2 className="break-words text-base font-semibold">{employee.full_name || "Sin nombre"}{employee.id === actorId ? <span className="ml-2 text-xs font-normal text-[var(--muted)]">Tú</span> : null}</h2><p className="mt-0.5 break-all text-xs text-[var(--muted)]">{employee.email || "Correo no disponible"}</p><p className="mt-1 text-xs text-orange-800">{roles[employee.role]} · <span className={employee.active ? "text-emerald-800" : "text-stone-600"}>{employee.active ? "Activo" : "Inactivo"}</span></p></div></div>
        <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setSalesEmployee(employee)} className={cardAction}>Historial de ventas</button><button type="button" disabled={!!busy || employee.id === actorId} onClick={() => void toggle(employee)} className={`${cardAction} ${employee.active ? "text-red-700" : "text-emerald-800"}`} title={employee.id === actorId ? "Tu acceso debe mantenerse activo." : undefined}>{busy === employee.id ? "Guardando…" : employee.active ? "Desactivar acceso" : "Reactivar acceso"}</button></div>
      </article>)}</div>}
    </> : null}
    <Modal open={salesEmployee !== null} title={`Ventas de ${salesEmployee?.full_name || salesEmployee?.email || "empleado"}`} onClose={() => setSalesEmployee(null)} wide>{salesEmployee ? <EmployeeSalesPanel key={salesEmployee.id} employee={salesEmployee}/> : null}</Modal>
  </div>;
}
