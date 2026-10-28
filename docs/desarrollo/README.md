# Desarrollo de mejoras de octubre de 2026

Rama de trabajo: `desarrollo/mejoras-octubre-2026`, creada desde `86a2bb3`. Backend compartido: proyecto Supabase `idqgwcrczdqvacxneyui`.

## Comandos de preparación

```powershell
pnpm install --frozen-lockfile
pnpm check:env
pnpm test:preparacion
pnpm exec tsc --noEmit --incremental false
pnpm build
pnpm start --hostname 127.0.0.1 --port 3100
```

`.env.local` contiene únicamente configuración pública y controles de prueba. `.env.test.local` queda reservado al correo/contraseña de una cuenta de prueba; ambos están ignorados por Git. `.env.example` documenta nombres sin valores privados.

Playwright carga la configuración local y rechaza pruebas contra la base compartida si no se habilitan expresamente, no se declara el respaldo listo, faltan credenciales o falta el identificador `MM-TEST-YYYYMMDD-identificador`. Por defecto no ejecutar E2E de ventas. La guarda tampoco sustituye permisos de servidor ni protege llamadas manuales fuera del runner.

El prefijo identifica clientes de prueba; no autoriza borrar por coincidencias de nombre. Guardar los IDs creados y limpiar exclusivamente esos registros, nunca usar `clear_order_history`, reset ni cargar el seed original sobre producción.

No se crearon cuentas de prueba, pedidos, migraciones ni cambios de roles durante la preparación. Falta completar respaldo integral y acceso de pruebas antes de iniciar los módulos. No poner claves administrativas en variables `NEXT_PUBLIC_`.

En el workspace original: `PROYECTO/PLAN_MAESTRO_IMPLEMENTACION.md` contiene el orden y los controles; `SUPABASE/PREPARACION_DESARROLLO_2026-10-27.md` registra esta preparación. Los respaldos privados están fuera del repositorio oficial y no deben copiarse a Git.
