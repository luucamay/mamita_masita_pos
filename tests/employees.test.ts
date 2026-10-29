import assert from "node:assert/strict";
import { test } from "node:test";
import { employeeInput, provisionEmployee, type EmployeeInput, type Provision, type AuthIdentity } from "../lib/employee-provision.ts";

const input: EmployeeInput = { requestId: "10000000-0000-4000-8000-000000000001", email: "new@example.test", fullName: "Empleado QA", role: "staff", password: "Synthetic12345" };
const reservation: Provision = { request_id: input.requestId, email: input.email, full_name: input.fullName, role: input.role, actor_id: "admin", completed: false, auth_user_id: null };
const identity: AuthIdentity = { id: "user", email: input.email, app_metadata: { mamita_employee_request: input.requestId } };
const profile = { id: "user", full_name: input.fullName, role: input.role, active: true, updated_at: "2026-10-29T12:00:00Z" };

test("P05 validates input, normalizes email, and rejects invalid roles, IDs and weak passwords", () => {
  assert.equal(employeeInput({ ...input, email: " New@Example.Test " }).email, input.email);
  for (const value of [{ ...input, password: "short" }, { ...input, role: "owner" }, { ...input, requestId: "bad" }, { ...input, email: "bad" }, { ...input, fullName: "A" }]) assert.throws(() => employeeInput(value));
});
test("P05 creates an identity with its reserved marker and completes exactly that profile", async () => {
  let created = 0, completed = 0;
  const result = await provisionEmployee(input, {
    reserve: async () => reservation, find: async () => null,
    create: async (form, marker) => { assert.equal(form.password, input.password); assert.equal(marker, input.requestId); created++; return identity; },
    complete: async (request, user) => { assert.equal(request, input.requestId); assert.equal(user, identity.id); completed++; return profile; },
  });
  assert.equal(created, 1); assert.equal(completed, 1); assert.equal(result.employee.email, input.email); assert.equal(result.resumed, false);
});
test("P05 recovers a lost Auth response without creating a second identity", async () => {
  let finds = 0, created = 0;
  const result = await provisionEmployee(input, { reserve: async () => reservation, find: async () => ++finds === 1 ? null : identity, create: async () => { created++; throw new Error("Lost response after commit"); }, complete: async () => profile });
  assert.equal(created, 1); assert.equal(result.resumed, true);
});
test("P05 retry completes a tracked pending profile without replacing its password", async () => {
  let creates = 0, completes = 0;
  const deps = { reserve: async () => reservation, find: async () => identity, create: async () => { creates++; return identity; }, complete: async () => { if (++completes === 1) throw new Error("DB unavailable"); return profile; } };
  await assert.rejects(provisionEmployee(input, deps), /falta completar el perfil/);
  const result = await provisionEmployee({ ...input, requestId: "10000000-0000-4000-8000-000000000002" }, deps);
  assert.equal(creates, 0); assert.equal(completes, 2); assert.equal(result.resumed, true);
});
test("P05 never adopts an unrelated existing identity or modifies its profile", async () => {
  let writes = 0;
  await assert.rejects(provisionEmployee(input, { reserve: async () => reservation, find: async () => ({ ...identity, app_metadata: {} }), create: async () => { writes++; return identity; }, complete: async () => { writes++; return profile; } }), /otra cuenta/);
  assert.equal(writes, 0);
});
test("P05 completed operation retries preserve subsequent deactivation", async () => {
  const result = await provisionEmployee(input, { reserve: async () => ({ ...reservation, completed: true, auth_user_id: identity.id }), find: async () => { throw new Error("Unneeded directory call"); }, create: async () => { throw new Error("Duplicate"); }, complete: async () => ({ ...profile, active: false }) });
  assert.equal(result.employee.active, false);
});
test("P05 failed reservation cannot call privileged Auth operations", async () => {
  let calls = 0;
  await assert.rejects(provisionEmployee(input, { reserve: async () => { throw new Error("Access denied"); }, find: async () => { calls++; return null; }, create: async () => { calls++; return identity; }, complete: async () => { calls++; return profile; } }));
  assert.equal(calls, 0);
});
