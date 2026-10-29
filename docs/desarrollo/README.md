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

El 29/10 se verificó el acceso administrativo Auth y se crearon cinco cuentas QA con perfiles admin, staff, cook, barista y staff inactivo. Login y lectura de perfil propio comprobados con la clave pública; credenciales por rol en `.env.test.local` y manifiesto privado fuera del repositorio. No se crearon pedidos ni se aplicaron migraciones en la base compartida. Las pruebas de ventas siguen deshabilitadas. No poner claves administrativas en variables `NEXT_PUBLIC_`.

Omar autorizó comenzar P01 preparando código y pruebas locales sin esperar PostgreSQL/Vercel login. La migración de producción sigue pendiente del respaldo; Vercel se verificará antes de publicar. Ver [implementación, matriz y pruebas de P01](P01_PERMISOS_INTEGRIDAD_IMPORTES.md). La prueba SQL usa PostgreSQL temporal con datos ficticios; no requiere instalar el stack Supabase local.

En el workspace original: `PROYECTO/PLAN_MAESTRO_IMPLEMENTACION.md` contiene el orden y los controles; `SUPABASE/PREPARACION_DESARROLLO_2026-10-27.md` registra esta preparación. Los respaldos privados están fuera del repositorio oficial y no deben copiarse a Git.

P02 añade búsqueda del catálogo y revisión de navegación. Ver [alcance, medidas y guía](P02_BUSCADOR_Y_NAVEGACION.md). Para probar sin interferir con `pnpm dev`: `pnpm build:qa` y `pnpm test:p02`; se usa `.next-qa` y se bloquean escrituras reales de catálogo en las pruebas. La migración P01 sigue pendiente de aplicación.
