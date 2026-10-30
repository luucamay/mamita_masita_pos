import {inspectEnvironment} from "./environment.cjs";

// Reads process environment only. Never prints credentials or loads private files.
let failed=false;
function check(label,valid){console.log(`${valid?"OK":"FALTA"} ${label}`);if(!valid)failed=true;}
try {
 const state=inspectEnvironment();
 check("Supabase del negocio",state.sharedProduction&&state.publicKeyConfigured);
} catch {check("Configuración pública de Supabase",false);}
check("Clave administrativa solo de servidor",Boolean(process.env.SUPABASE_SECRET_KEY));
check("Pantallas QA deshabilitadas",process.env.MAMITA_QA_BUILD!=="true");
check("Pruebas de escritura compartida deshabilitadas",process.env.MAMITA_ALLOW_SHARED_DB_TESTS!=="true");
check("Sin contraseña/clave administrativa NEXT_PUBLIC",!Object.entries(process.env).some(([name,value])=>name.startsWith("NEXT_PUBLIC_")&&/PASSWORD|SECRET|SERVICE_ROLE/.test(name)&&value));
process.exitCode=failed?1:0;
