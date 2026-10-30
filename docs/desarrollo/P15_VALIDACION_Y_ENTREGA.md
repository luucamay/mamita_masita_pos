# P15 — Validación integral y preparación de entrega

Fecha: 30/10/2026. Proyecto oficial: `mamita_masita_pos`. Rama: `desarrollo/mejoras-octubre-2026`. Base funcional anterior: commit `6171615`.

| Entregable | Resultado |
| --- | --- |
| Regresión P01–P14 y ajustes posteriores | 72 escenarios de navegador aprobados en una ejecución completa con dependencias corregidas y datos limpios. |
| Importes, fechas, permisos y Excel | 48 pruebas de lógica, 7 de preparación y 72 grupos SQL sintéticos aprobados. |
| Compilación | QA y entrega compiladas; comprobación de tipos aprobada. Entrega usa QA deshabilitado. |
| Conciliación | Retirados únicamente seis pedidos manuales de prueba confirmados por Omar; el resto de las filas conserva sus huellas. |
| Seguridad de dependencias | Next.js 15.5.28, Playwright 1.55.1 y transitivas corregidas; auditoría de producción sin avisos conocidos. |
| Documentación | Guía para la dueña, publicación/reversión, inventario de migraciones y evidencia sanitizada. |
| Publicación | No ejecutada. Dominio, rama y variables efectivos de Vercel deben confirmarse al coordinarla. |

**Estado:** validación técnica y preparación de entrega terminadas; las dos comprobaciones adicionales de la compilación de entrega pasaron. El cierre publicado del plan maestro queda separado: no se declara un despliegue que no se ha realizado ni aceptación de la dueña en dispositivos que no estuvieron disponibles.

## 1. Cambios propios de P15

- `build:release` compila en `.next-release`, con QA deshabilitado, sin tocar `.next` del servidor de desarrollo. No cambia el build normal de Vercel.
- `test:p15`, `test:p15:ui` y `test:p15:release` reúnen las comprobaciones reproducibles. La prueba de entrega usa puerto 3102; QA usa 3101.
- `check:release` valida configuración por nombre sin imprimir secretos; `check:artifacts` busca credenciales locales en fuente/recursos estáticos y verifica que ambos builds incluyan el logo del Excel.
- Middleware rechaza `/qa-preview` y descendientes con HTTP 404 antes de autenticar/renderizar si QA está deshabilitado. La comprobación de entrega encontró un HTTP 200 de respuesta transmitida para `notFound()`; se agregó el bloqueo temprano, sin modificar permisos operativos.
- Se actualizó la referencia mensual independiente tras retirar las pruebas: Bs 6.832, 150 pedidos cobrados y 442 unidades en octubre. Efectivo Bs 3.471,50; QR Bs 3.360,50. La referencia diaria del 17/10 y semanal del 12–18/10 no cambia.

## 2. Seguridad y compatibilidad

La primera auditoría de producción registró 16 avisos en dependencias: 3 críticos, 8 altos y 5 moderados. Son avisos de paquetes instalados, no evidencia de explotación del negocio. Se aplicaron las correcciones antes de preparar el paquete:

| Paquete | Versión final | Motivo |
| --- | --- | --- |
| Next.js | 15.5.28, fijada | Parches dentro de la misma rama principal. |
| Playwright | 1.55.1, fijada | Corrección del instalador; las pruebas usan Chrome disponible, sin descargar navegadores inseguros. |
| `next > sharp` | 0.35.5 | Versión corregida recomendada por el aviso de Next; el lock anterior conservaba 0.34.5. |
| `next > postcss` | 8.5.26 | Sustituye la dependencia antigua por la versión de PostCSS ya usada en el proyecto. |
| `source-map-js` anterior a 1.2.2 | 1.2.2 | Corrección transitiva. |
| `exceljs > uuid` | 11.1.1 | Versión corregida con CommonJS; generación/lectura de Excel comprobadas. |

Overrides explícitos en `package.json` y resolución reproducible en `pnpm-lock.yaml`. Sin cambio de versión principal de Next, React, Supabase o ExcelJS. No se modificó el esquema por P15.

Fuentes de comprobación: [release oficial de Next.js](https://github.com/vercel/next.js/releases/tag/v15.5.28), [aviso sobre sharp](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [aviso de uuid](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), [comportamiento de not-found transmitido](https://nextjs.org/docs/app/api-reference/file-conventions/not-found). Auditoría ejecutada el 30/10; cero avisos conocidos no garantiza ausencia de cualquier vulnerabilidad futura.

## 3. Limpieza autorizada y preservación

Omar confirmó expresamente que los seis pedidos `20261030-001` a `20261030-006` eran pruebas manuales y pidió retirarlos. Cuatro estaban cobrados. Antes de actuar se guardaron once tablas públicas, 10.386 filas y una copia específica de las nueve tablas públicas/privadas asociadas a esos seis pedidos. Se verificaron SHA-256; archivos privados fuera del repositorio oficial.

| Concepto | Retirado | Estado final |
| --- | --- | --- |
| Pedidos | 6 | 939 |
| Líneas de pedido | 17 | 2.224 |
| Pagos | 4 | 938 |
| Eventos de esos pedidos | 36 | 5.988 |
| Requests privados de cliente | 3 | 0 |
| Ingreso de prueba | Bs 222: efectivo 102 + QR 120 | Excluido de los reportes reales. |
| Productos / categorías / perfiles | 0 | 63 / 10 / 11 |
| Turnos / ajustes de caja | 0 | 0 / 0; control de turnos inactivo. |

Limpieza por seis UUID explícitos, nunca por coincidencia de nombre o por eliminar todos los pedidos de una cuenta QA. Se conservaron contadores y numeración; el próximo pedido del día puede comenzar en 007. No se reinician números para ocultar los huecos.

Dos intentos se revirtieron sin cambios: eliminación en cascada encontró la protección de recálculo; Supabase rechazó cambiar el modo de replicación. La operación aplicada usó únicamente DML ordinario en una transacción: validó los seis pedidos y Bs 222, mantuvo bloqueos breves, preparó esos seis encabezados para retirar primero sus líneas y luego eliminó sus asociaciones/encabezados. No deshabilitó triggers, RLS ni guardas. Se compararon dentro de la transacción y después las huellas de las quince tablas restantes; coincidieron. Una confirmación del conector venció antes de ejecutar y se verificó que los seis pedidos seguían presentes antes del reintento.

Las identidades QA se conservan para la revisión final de Omar y no se entregan al personal como cuentas definitivas. Su desactivación al publicar se hace por el manifiesto privado; no se borraron empleados reales. Los escenarios de navegador no crean pedidos nuevos en producción y la prueba SQL no conecta a Supabase.

## 4. Pruebas, evidencias y límites

| Ejecución | Resultado | Evidencia local ignorada por Git |
| --- | --- | --- |
| Lógica completa | 48/48 | `test-results/p15-final-unit.log` |
| Preparación | 7/7 | `test-results/p15-environment.log` |
| SQL temporal | 72/72, sin producción | `test-results/p15-database.log` |
| Regresión con parches y datos limpios | 72/72 | `test-results/p15-final-regression.json` |
| Tipos | Sin errores | `test-results/p15-types.log` |
| Build QA / entrega | Aprobados | `test-results/p15-final-qa-build.log`, `p15-final-release-build.log` |
| Entrega sin QA | 2/2 aprobadas | `test-results/p15-release-final.json` |
| Auditoría de producción | 0 info/bajo/moderado/alto/crítico | `test-results/p15-dependency-audit-final.json` |
| Secretos / logo | Sin coincidencias; logo en ambos builds | `test-results/p15-artifacts.log` |

La regresión incluye mesa/para llevar, edición y diferencias de cobro, promociones, compra personal, perfiles, empleados, permisos, historial, dashboard, Excel, desconexión, actualización Realtime, caja/recepción y reintentos. Reutiliza respuestas sintéticas para escrituras y lecturas reales autenticadas para reportes/permisos. La comprobación de entrega verifica rutas QA, descarga Excel con logo/dos hojas y cifras independientes, formulario de acceso, mesa móvil, apertura cancelada y caché sin páginas privadas.

La primera comprobación de entrega hizo visibles dos ajustes del montaje de prueba: el carrito de escritorio ya estaba abierto y no mostraba Ver pedido, y el proceso servidor necesitaba recibir la variable administrativa explícita. Se corrigieron el viewport móvil y la carga privada del entorno del runner; no se agregó una lectura de archivos privados al código de producción. Repetición final 2/2 aprobada. El rechazo temprano de QA también pasó tras la corrección del middleware.

Revisión visual: 320/390 px y escritorio 1365 px en la entrega; la regresión conserva además 360 px y modales de credenciales/cierre/recepción. Capturas finales en `test-results/p15/`. No se certifican Android/iOS físicos, impresoras, permisos reales de sonido/notificación ni dominio Vercel desde una simulación de Chrome.

Advisors de Supabase: sin errores nuevos; un aviso previo de contraseñas filtradas desactivado y once informaciones de RLS sin políticas (diez tablas privadas sin acceso directo y el contador interno). No se modificó Auth para silenciar avisos.

## 5. Migraciones ya aplicadas

Las nueve migraciones históricas anteriores al desarrollo permanecen en el historial remoto. Las trece incorporadas para esta entrega ya están aplicadas:

| Versión | Nombre |
| --- | --- |
| `20261029163703` | p01_permissions_integrity_amounts |
| `20261029163747` | p04_edit_orders |
| `20261029163809` | p05_employee_access |
| `20261030005743` | p06_daily_promotions |
| `20261030014210` | p07_employee_purchases |
| `20261030041017` | p09_sales_report_periods |
| `20261030102045` | p13_live_order_board |
| `20261030110916` | p14_read_performance |
| `20261030124536` | compact_daily_closed |
| `20261030124544` | customer_payment_flows |
| `20261030130832` | payment_recorded_at |
| `20261030143332` | admin_employee_sales_history |
| `20261030161805` | shift_cashbox_and_employee_passwords |

P15 no agrega migración. No reaplicar estos SQL ni las migraciones antiguas al publicar. La retirada de datos QA es mantenimiento autorizado, no una migración para repetir en otros entornos.

## 6. Entrega y aceptación

- [Guía para la dueña y empleados](GUIA_USO_DUENA.md).
- [Publicación, variables, verificación y reversión](PUBLICACION_Y_REVERSION.md).
- [Evidencia sanitizada de P15](../../../SUPABASE/evidencias/p15_entrega_2026-10-30.json).
- Paquete de fuente versionada y manifiesto SHA-256 en `ENTREGA/P15_2026-10-30`, fuera del repositorio oficial; no contiene `.env`, backups, credenciales ni dependencias instaladas.

Antes de la publicación falta confirmar la configuración efectiva del proyecto Vercel y coordinar la integración con Omar. El backup integral PostgreSQL/Auth y su recuperación probada siguen sin acreditarse; no se bloqueó el desarrollo ni se pidió nuevamente contraseña/login para estas pruebas. La copia privada de tablas no se presenta como recuperación integral.

La primera apertura real activa el control de caja. No se confirmó una apertura ni se cambiaron contraseñas reales para cerrar P15. La guía distingue revisar/cancelar de comenzar la operación real. La aceptación de la dueña y comprobación en sus teléfonos se registra al realizarse; no se infiere del resultado de las pruebas.
