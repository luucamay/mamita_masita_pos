# P04 — Edición de pedidos abiertos

| Elemento | Resultado |
| --- | --- |
| Acceso | Admin y atención, desde el detalle de un pedido sin cobrar |
| Cambios | Agregar productos activos; quitar o cambiar cantidades pendientes |
| Conservación | Mismo pedido y hora; entregados protegidos; quitados quedan anulados para auditoría |
| Consistencia | Un guardado transaccional, revisión contra cambios simultáneos y UUID de reintento |
| Base | Migración `20261029163747_p04_edit_orders.sql`, aplicada remotamente después de P01 el 29/10 |
| Pruebas | 17 grupos SQL locales (13 P01 + 4 P04), 3 navegador, build/tipos aprobados |

Omar indicó que el cliente cambia de opinión después de colocar el pedido. Se permite corregir pendientes y añadir más antes del cobro, incluso después de entregar lo anterior. Quitar productos ya entregados requiere una decisión adicional de negocio; no se elimina una venta cobrada.

La RPC vuelve a comprobar rol activo, versión, estado, pertenencia de cada línea y precios vigentes de nuevos productos. Mantiene el precio histórico de líneas existentes al cambiar cantidad. Un fallo revierte todo el lote; el mismo identificador de operación no vuelve a añadir productos. Un cambio concurrente exige descartar y recargar explícitamente, conservando el borrador hasta entonces. No reimprime líneas ya enviadas a cocina.

Archivos: `components/orders/order-editor.tsx`, `components/orders/orders-list.tsx`, `lib/order-edit.ts`, `lib/orders.ts` y la migración. El editor muestra una vista de consulta y bloquea Guardar si la base todavía no tiene la RPC. No hay escritura alternativa al esquema antiguo.

## Guía de revisión

P01/P04 ya están aplicadas. Usar pedidos de prueba identificados al verificar escrituras en la base compartida:

1. Entrar como atención/admin → Pedidos → abrir pedido sin cobrar → Editar pedido.
2. Agregar un producto y Guardar; comprobar total, mismo número y misma hora original.
3. Editar nuevamente: cambiar cantidad pendiente, quitar otra y guardar; comprobar total.
4. Cancelar una edición y comprobar que no se guardó. Intentar quitar todo: Guardar queda deshabilitado.
5. Entregar una línea: ya no debe ofrecer Quitar/cantidad, pero sí agregar productos antes de cobrar.
6. Abrir el mismo pedido en dos sesiones; guardar una y después la otra: la segunda debe avisar del conflicto y ofrecer recarga.
7. Cobrarlo: ya no aparece Editar pedido. Cocina/Café no tienen acceso a la edición.

Inicialmente las pruebas usaron PostgreSQL temporal y respuestas ficticias interceptadas en navegador. Tras la autorización de Omar se aplicó la migración: el flujo real SQL de edición, colas y cobro pasó en Supabase dentro de una transacción revertida. También se abrió el editor real desde la app y se canceló un borrador sin modificar el pedido existente. La ruta `/qa-preview/orders` solo está habilitada en `build:qa`, exige sesión de atención/admin y no sustituye las RPC; fuera de QA devuelve 404. Ver [resultado remoto](APLICACION_SUPABASE_2026-10-29.md).

Comandos: `node scripts/test-p01-database.mjs p04`, `pnpm build:qa`, `pnpm exec playwright test --config playwright.modules.config.ts --grep P04`. Captura revisada móvil de 390 px sin desbordamiento: `test-results/modules/p04-mobile.png` (ignorada por Git). La primera ejecución de navegador detectó que Next omite carpetas privadas `__qa`; corregida a `qa-preview` y repetidas las tres pruebas con resultado aprobado. Sin despliegue ni cambios de pedidos reales.
