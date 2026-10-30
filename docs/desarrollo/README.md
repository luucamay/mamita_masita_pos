# Desarrollo de mejoras de octubre de 2026

**Accesos, Atención y caja compartida, 30/10:** usuario corto con `@mamita.local`, credenciales en modal y regeneración explícita para cuentas anteriores; historial de hoy/semana/mes/rango; mesas 1–6, Para llevar y Otra en una fila; colas compactas y explicación de Cobros del equipo. Caja implementa Abrir → Cerrar y entregar → Recibir, con efectivo inicial, retiro, diferencias e historial para administración. Migración `20261030161805` aplicada; control inactivo hasta la primera apertura real. Ver [reglas, pruebas y guía](ACCESOS_TURNOS_Y_ATENCION_2026-10-30.md). Sin push ni despliegue. P15 pendiente de revisión funcional y coordinación de publicación.

**Administración compacta, 30/10:** Admin menú se organiza en tres tarjetas con modales; edición completa y retiro/reactivación de productos. Empleados incorpora filtros por rol, alta modal y ventas atribuidas a quien registró el pedido, con caja separada. Historial permite seleccionar el mes; Excel tiene cabecera compacta con logo y dos hojas: Ventas/Desglose. Se aplica la consulta de lectura e índice `20261030143332`. Ver [implementación, pruebas y guía de uso](ADMIN_INTERFAZ_Y_REPORTES_2026-10-30.md). Datos de negocio sin cambios, sin despliegue; revisión de Omar pendiente. Las notas siguientes son anteriores.

**Actualización posterior a P14, 30/10:** interfaz compacta, categorías desplegables, mesa flexible y actualización centralizada. La regla vigente es Mesa al finalizar / Para llevar al registrar; incluye ajustes y devoluciones. Cerrados inicia por hoy y permite fecha/Todo el historial. Migraciones `20261030124536`, `20261030124544` y `20261030130832` aplicadas. Ver [guía, reglas y pruebas](AJUSTES_COMPACTOS_Y_FLUJOS_2026-10-30.md). Sin despliegue; revisión de Omar pendiente. Las notas inferiores son estados anteriores.

**Estado vigente P14, 30/10:** lectura de Cerrados por páginas de 24, colas con actualización agrupada y respaldo de 30 segundos, comprobación Auth/perfil en paralelo y una verificación por petición API. Migración `20261030110916` aplicada; no modifica ventas ni RLS. Ver [P14](P14_RENDIMIENTO.md) para medidas antes/después, pruebas y guía. Sin despliegue; revisión de Omar pendiente. P15 no iniciado.

**Estado vigente P13, 30/10:** Pedidos en vivo con tarjetas, productos y tiempos de Preparación/Cuenta abierta según D13 confirmado. Migración `20261030102045` aplicada. Prueba real de dos sesiones aprobada y datos QA retirados, con huellas de las diez tablas iguales a la línea base. Ver [P13](P13_PEDIDOS_TIEMPO_REAL.md). Sin despliegue; revisión de Omar pendiente. P14 no iniciado.

**Estado vigente P11/P12, 30/10:** admin inicia en Historial y reportes con hoy y tabla por producto. Menú operativo de admin en `/menu`; Atención conserva `/`. Exportación actual XLSX real con formato acordado, filtros, totales y empleados identificados. Se retiró CSV. Ambas entregas reutilizan P09, sin migraciones ni escrituras de ventas. Ver [P11](P11_DASHBOARD_ADMIN.md), [P12](P12_EXPORTACION_EXCEL.md). Pendiente revisión de Omar y muestra; sin despliegue. Las notas inferiores son históricas.

**Estado vigente, 30/10:** P09/P10 implementados después de P07/P08; migración P09 `20261030041017` aplicada, P10 sin cambios adicionales en base. Reportes inicia solo con hoy y permite consultar semana/mes/fecha. Los cuadros Total/Efectivo/QR corresponden al período/tipo de compra y el pago filtra el detalle. Ver [P09](P09_PERIODOS_REPORTES.md), [P10](P10_SUMATORIAS_CAJA.md). Sin despliegue; revisión funcional pendiente. El estado del 29/10 de abajo es histórico.

**Estado actual, 29/10:** P01–P08 implementados; P01/P04/P05/P06/P07 aplicados al Supabase compartido con autorización de Omar. P08 no requiere migración. Sin despliegue web; revisión funcional pendiente. Las notas de preparación inferiores son históricas. Ver [P07 compra personal](P07_COMPRAS_EMPLEADOS.md), [P08 perfil](P08_PERFIL.md) y [aplicación inicial de migraciones](APLICACION_SUPABASE_2026-10-29.md). Las pruebas generales de ventas continúan bloqueadas y la recuperación integral pendiente.

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
