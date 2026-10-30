# Aplicación de P01, P04 y P05 en Supabase — 29/10/2026

| Elemento | Resultado |
| --- | --- |
| Autorización | Omar: «Hazlo entonces. Para hacer pruebas» |
| Destino | Supabase actual compartido `idqgwcrczdqvacxneyui` |
| P01 | `20261029163703_p01_permissions_integrity_amounts.sql`, aplicada |
| P04 | `20261029163747_p04_edit_orders.sql`, aplicada |
| P05 | `20261029163809_p05_employee_access.sql`, aplicada |
| Web | Rama local `desarrollo/mejoras-octubre-2026`; sin push ni despliegue Vercel |
| Datos existentes | Nueve huellas anteriores iguales después de excluir las nuevas columnas y únicamente el nuevo perfil QA |

Se aplicaron secuencialmente mediante el conector Supabase, cada una con transacción explícita y límites de espera de bloqueo/ejecución. P01 se verificó antes de P04, y P04 antes de P05. Los archivos locales se renombraron a las versiones asignadas por el conector para que el historial no considere pendientes cambios ya aplicados. No se reprodujeron las migraciones antiguas ni el seed.

## Copia previa y recuperación

Antes de aplicar se exportaron las nueve tablas de public: 10.321 filas, claves únicas verificadas, conteos y SHA-256 de los archivos comprobados. Se guardaron además definiciones de funciones/vistas/triggers/índices/constraints, permisos y políticas, esquema e historial de migraciones previo. Todo permanece en `SUPABASE/RESPALDOS_PRIVADOS/2026-10-29_migraciones`, fuera del repositorio y sin publicación.

La copia permite consultar y preparar una recuperación dirigida de los objetos modificados. **No es un backup integral PostgreSQL/Auth ni se ha probado una restauración completa.** Omar autorizó avanzar conociendo ese pendiente. `MAMITA_BACKUP_READY` y `MAMITA_ALLOW_SHARED_DB_TESTS` permanecen en false; no se habilitó el runner general de ventas ni se declaró resuelto el respaldo integral.

Si surge un problema, detener pruebas, conservar evidencia y preparar una migración correctiva a partir de la copia previa. No restablecer automáticamente las políticas amplias anteriores ni borrar datos nuevos. Las columnas nuevas tienen valores predeterminados históricos; no es necesario borrarlas para corregir una función o interfaz. Volver a un commit Git no revierte Supabase.

## Pruebas remotas reales

1. P01: las huellas anteriores coincidieron después de agregar columnas; cero funciones privilegiadas públicas ejecutables por anon, perfiles sin escritura directa de cliente y vista de cocina con `security_invoker=true`.
2. P04/P01: pedido ficticio en una transacción SQL con las identidades QA autenticadas de atención, barista y cocina. Bs 59 → agregar Bs 79 → quitar Bs 69 → cambiar cantidad Bs 118 → entregar → agregar después de entregar Bs 128 → entregar y cobrar. Se comprobaron reintento sin duplicado, conflicto de revisión, hora original, roles, protección de entregados, reapertura antes del pago, un único cobro y bloqueo de edición posterior. **ROLLBACK al finalizar**, sin pedido/pago/contador/eventos de prueba persistentes.
3. P05: alta real desde `/empleados` mediante Admin Auth API y perfil. Login del empleado, API administrativa denegada, desactivación desde admin, rechazo de la sesión previa, reactivación y nuevo login con la misma contraseña. La cuenta QA se conserva **inactiva** al terminar, sin pedidos asociados. No se modificaron cuentas del negocio.
4. P04 desde app: lectura real de un pedido existente, apertura del editor, borrador con un producto adicional y cancelación. No se guardó ninguna edición de un pedido del negocio. La comprobación de escrituras P04 remota se realizó mediante SQL transaccional, no mediante un guardado HTTP de un pedido real.
5. Navegador: doce pruebas anteriores de acceso/buscador aprobadas tras migrar. La suite de módulos mantiene operaciones ficticias interceptadas para regresión; el caso de preparación ahora reconoce el esquema habilitado.

`playwright.shared.config.ts` exige `MAMITA_SCOPED_EMPLOYEE_TEST=MM-TEST-20261029-P05`. Solo prueba una identidad QA exacta cuyo archivo privado contiene las credenciales; no habilita ventas generales. Las trazas, videos y capturas automáticas con credenciales están desactivados. La suite `e2e/shared-migrations.spec.ts` pasó sus dos casos.

## Estado final y acceso

- Pedidos: **939**; pagos: **938**; catálogo: **63 productos**. Los importes, estados y registros anteriores se conservaron, incluidos eventos, impresión y contadores.
- Perfiles e identidades Auth: **11** cada uno. Antes eran 10; la diferencia es `qa-p05-20261029@mamita-masita.test`, retenida inactiva. Su contraseña está en el archivo privado `qa-p05-access.json`; no está en documentación, logs ni Git.
- Para revisar como admin, usar `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD` del archivo ignorado `mamita_masita_pos/.env.test.local`. No usar credenciales del personal del negocio.
- Abrir `http://localhost:3000`, entrar como QA admin y revisar Pedidos → detalle → Editar pedido, y Empleados. Ya no debe aparecer la advertencia de migración faltante y se puede guardar sobre datos de prueba identificados.
- El módulo de empleados requiere `SUPABASE_SECRET_KEY` en el servidor. Desarrollo local la lee desde `.env.admin.local`; el acceso real se comprobó. La configuración equivalente en Vercel se verificará antes de publicar.

Evidencia sanitizada: `SUPABASE/evidencias/migraciones_aplicadas_2026-10-29.json`. Los asesores dejaron de señalar vistas/funciones públicas privilegiadas y search_path mutable. Persisten avisos informativos [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) en tablas internas sin acceso directo y el aviso de [protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambió esa configuración de Auth.

Quedan la aceptación funcional de Omar, recuperación integral, configuración y despliegue Vercel, y las entregas posteriores del plan. No se afirma que toda la aplicación haya sido publicada.
