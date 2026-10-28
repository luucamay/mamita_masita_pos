const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const SHARED_PROJECT_REF = "idqgwcrczdqvacxneyui";

function loadLocalEnvironment() {
  for (const filename of [".env.local", ".env.test.local"]) {
    const path = resolve(__dirname, "..", filename);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function inspectEnvironment(env = process.env) {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL.");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL no es una URL válida.");
  }
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("El protocolo de Supabase debe ser HTTP o HTTPS.");
  }
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const projectRef = url.hostname.endsWith(".supabase.co")
    ? url.hostname.slice(0, -".supabase.co".length)
    : null;
  return {
    host: url.hostname,
    projectRef,
    local,
    sharedProduction: projectRef === SHARED_PROJECT_REF,
    publicKeyConfigured: Boolean(
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    backupReady: env.MAMITA_BACKUP_READY === "true",
    sharedTestsEnabled: env.MAMITA_ALLOW_SHARED_DB_TESTS === "true",
    testCredentialsConfigured: Boolean(env.E2E_EMAIL && env.E2E_PASSWORD),
  };
}

function assertE2EAllowed(env = process.env) {
  const state = inspectEnvironment(env);
  if (!state.local && !state.sharedProduction) {
    throw new Error("Destino E2E desconocido: no se autoriza escribir en esa base.");
  }
  if (state.sharedProduction && !state.sharedTestsEnabled) {
    throw new Error(
      "E2E bloqueado: Supabase es producción compartida. Habilitar MAMITA_ALLOW_SHARED_DB_TESTS solo para una ejecución registrada y autorizada.",
    );
  }
  if (state.sharedProduction && !state.backupReady) {
    throw new Error("E2E bloqueado: primero completar y verificar el respaldo.");
  }
  if (!state.publicKeyConfigured) throw new Error("Falta la clave pública de Supabase.");
  if (!state.testCredentialsConfigured) {
    throw new Error("Falta una cuenta exclusiva de pruebas en E2E_EMAIL/E2E_PASSWORD.");
  }
  if (!/^MM-TEST-\d{8}-[A-Za-z0-9-]+$/.test(env.MAMITA_TEST_RUN_ID || "")) {
    throw new Error("Falta MAMITA_TEST_RUN_ID con formato MM-TEST-YYYYMMDD-identificador.");
  }
  return state;
}

exports.SHARED_PROJECT_REF = SHARED_PROJECT_REF;
exports.loadLocalEnvironment = loadLocalEnvironment;
exports.inspectEnvironment = inspectEnvironment;
exports.assertE2EAllowed = assertE2EAllowed;
