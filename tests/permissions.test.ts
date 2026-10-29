import assert from "node:assert/strict";
import test from "node:test";
import { canAccessPath, isActiveProfile, safeLoginDestination, type UserRole } from "../lib/permissions.ts";

test("denies missing, inactive and unknown profiles", () => {
  for (const profile of [null, undefined, {}, { role: "admin", active: false }, { role: "owner", active: true }, { role: "staff", active: "true" }]) {
    assert.equal(isActiveProfile(profile), false);
    assert.equal(canAccessPath(profile, "/"), false);
  }
});

test("enforces the route matrix, including exports and nested admin paths", () => {
  const roles: UserRole[] = ["admin", "staff", "cook", "barista"];
  const cases: [string, UserRole[]][] = [["/", ["admin", "staff"]], ["/pedidos", ["admin", "staff"]], ["/cafe", ["admin", "staff", "barista"]], ["/cocina", ["admin", "staff", "cook"]], ["/menu-admin", ["admin"]], ["/empleados", ["admin"]], ["/empleados/nuevo", ["admin"]], ["/historial/export", ["admin"]], ["/menu-admin-evil", []], ["/empleados-evil", []], ["/unknown", []]];
  for (const [path, allowed] of cases) for (const role of roles) assert.equal(canAccessPath({ role, active: true }, path), allowed.includes(role), `${role}: ${path}`);
});

test("rejects external, obfuscated and unauthorized login redirects", () => {
  const staff = { role: "staff" as const, active: true };
  for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "/menu-admin", "/historial/export", "/login", "/%2f%2fevil.test", "/../historial"]) assert.equal(safeLoginDestination(value, staff), "/", value);
  assert.equal(safeLoginDestination("/pedidos?view=closed", staff), "/pedidos?view=closed");
  assert.equal(safeLoginDestination("/", { role: "cook", active: true }), "/cocina");
  assert.equal(safeLoginDestination(null, { role: "barista", active: true }), "/cafe");
});
