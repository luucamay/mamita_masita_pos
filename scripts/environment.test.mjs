import assert from "node:assert/strict";
import test from "node:test";
import { assertE2EAllowed, inspectEnvironment } from "./environment.cjs";

const ready = {
  NEXT_PUBLIC_SUPABASE_URL: "https://idqgwcrczdqvacxneyui.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key-for-unit-test-only",
  MAMITA_ALLOW_SHARED_DB_TESTS: "true",
  MAMITA_BACKUP_READY: "true",
  E2E_EMAIL: "qa@example.test",
  E2E_PASSWORD: "fixture-only-not-a-real-password",
  MAMITA_TEST_RUN_ID: "MM-TEST-20261027-P00",
};

test("bloquea la base compartida sin habilitación expresa", () => {
  assert.throws(() => assertE2EAllowed({ ...ready, MAMITA_ALLOW_SHARED_DB_TESTS: "false" }), /producción compartida/);
});

test("bloquea escritura si falta completar el respaldo", () => {
  assert.throws(() => assertE2EAllowed({ ...ready, MAMITA_BACKUP_READY: "false" }), /respaldo/);
});

test("no permite ejecutar el ciclo de venta sin cuenta de prueba", () => {
  assert.throws(() => assertE2EAllowed({ ...ready, E2E_PASSWORD: "" }), /cuenta exclusiva/);
});

test("exige identificar los registros de la ejecución", () => {
  assert.throws(() => assertE2EAllowed({ ...ready, MAMITA_TEST_RUN_ID: "" }), /MAMITA_TEST_RUN_ID/);
});

test("rechaza un proyecto remoto que no fue seleccionado", () => {
  assert.throws(() => assertE2EAllowed({ ...ready, NEXT_PUBLIC_SUPABASE_URL: "https://otro-proyecto.supabase.co" }), /Destino E2E desconocido/);
});

test("permite el destino elegido solo al satisfacer las condiciones", () => {
  assert.equal(assertE2EAllowed(ready).sharedProduction, true);
});

test("el informe de entorno no contiene los valores de claves o contraseñas", () => {
  const report = JSON.stringify(inspectEnvironment(ready));
  assert.equal(report.includes(ready.E2E_PASSWORD), false);
  assert.equal(report.includes(ready.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), false);
});
