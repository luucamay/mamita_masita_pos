"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Employee } from "@/lib/employee-provision";

const roles = { admin: "Administrador", staff: "Atención", cook: "Cocina", barista: "Barista" };
const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-200";
const primary = "min-h-11 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";

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
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const active = employees.filter((employee) => employee.active).length;

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
      setPassword(""); setFullName(""); setEmail(""); setRole("staff"); request.current = null; setShowForm(false);
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

  return <div className="mx-auto w-full max-w-6xl space-y-6 px-5 py-7 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-sm font-medium text-orange-700">Administración</p><h1 className="text-3xl font-semibold tracking-tight">Empleados</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">Gestiona quién puede acceder a la cafetería. Desactivar conserva su cuenta y el historial de sus pedidos.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={!!busy} onClick={() => void load()} className={secondary}>{busy === "load" ? "Actualizando…" : "Actualizar"}</button><button type="button" disabled={!ready || !!busy} onClick={() => { setShowForm((value) => !value); setPassword(""); request.current = null; }} className={primary}>{showForm ? "Cerrar formulario" : "Agregar empleado"}</button></div>
    </header>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p> : null}
    {showForm && ready ? <form aria-label="Agregar empleado" onSubmit={create} className="space-y-4 rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
      <h2 className="text-xl font-semibold">Nuevo empleado</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre completo<input autoComplete="off" required minLength={2} maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={!!busy} className={field} /></label>
        <label className="text-sm font-medium">Correo electrónico<input type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={!!busy} className={field} /></label>
        <div><label htmlFor="employee-role" className="text-sm font-medium">Rol</label><select id="employee-role" value={role} onChange={(event) => setRole(event.target.value as Employee["role"])} disabled={!!busy} className={field}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label htmlFor="employee-password" className="text-sm font-medium">Contraseña inicial</label><input id="employee-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} disabled={!!busy} aria-describedby="password-help" className={field} /><p id="password-help" className="mt-1 text-xs leading-5 text-[var(--muted)]">De 12 a 128 caracteres, con letras y números. Entrégala al empleado por un canal privado; no se envía por correo.</p></div>
      </div>
      <button type="submit" disabled={!!busy} className={primary}>{busy === "create" ? "Creando acceso…" : "Crear acceso"}</button>
    </form> : null}
    {ready ? <>
      <p className="border-b border-[var(--border)] pb-3 text-sm text-[var(--muted)]">{employees.length} empleados · {active} activos · {employees.length - active} inactivos</p>
      {!employees.length ? <p className="py-8 text-center text-[var(--muted)]">Todavía no hay empleados registrados.</p> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{employees.map((employee) => <article key={employee.id} aria-label={employee.full_name || employee.email} className="flex flex-col rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-base font-semibold text-orange-900">{(employee.full_name || employee.email).split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${employee.active ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>{employee.active ? "Activo" : "Inactivo"}</span></div>
        <h2 className="break-words text-lg font-semibold">{employee.full_name || "Sin nombre"}{employee.id === actorId ? <span className="ml-2 text-xs font-normal text-[var(--muted)]">Tu cuenta</span> : null}</h2>
        <p className="mt-1 break-all text-sm text-[var(--muted)]">{employee.email || "Correo no disponible"}</p><p className="mb-5 mt-2 text-sm font-medium text-orange-800">{roles[employee.role]}</p>
        <button type="button" disabled={!!busy || employee.id === actorId} onClick={() => void toggle(employee)} className={`${secondary} mt-auto ${employee.active ? "text-red-700" : "text-emerald-800"}`}>{busy === employee.id ? "Guardando…" : employee.active ? "Desactivar acceso" : "Reactivar acceso"}</button>
        {employee.id === actorId ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Tu acceso se mantiene activo para administrar el equipo.</p> : null}
      </article>)}</div>}
    </> : null}
  </div>;
}
