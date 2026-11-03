# Observaciones de cobros y cierres

Fecha: 03/11/2026. Rama: `desarrollo/mejoras-octubre-2026`.

| Lugar | Cambio |
| --- | --- |
| Cobro de mesa | Pagar abre el detalle; permite elegir Efectivo/QR y escribir una observación opcional antes de confirmar. |
| Para llevar | Observación en el pedido antes de Cobrar y registrar. |
| Compras de empleados | El cajero puede escribir una observación antes de confirmar el cobro y entrega. |
| Adicionales/devoluciones | Cada ajuste puede tener su propia observación; se mantiene la confirmación de la diferencia real. |
| Caja | Cada movimiento muestra su observación; el cierre conserva una copia y la observación general del turno queda visible en la tarjeta. |
| Historial | Observaciones de cobros del período, con pedido, fecha, cobrador, medio e importe. Respeta los filtros Diario/Semanal/Mensual, pago y tipo de compra. |
| Excel | Si hay notas, añade la hoja Observaciones; conserva Ventas y Desglose. |

## Reglas

- Campo opcional, hasta 500 caracteres; espacios exteriores eliminados. Se guarda con el cobro en una sola transacción y no obliga a escribir cuando no hubo incidencias.
- Una nota explica una operación: no modifica productos, importes, descuentos o medios de pago, ni confirma un QR pendiente.
- Solo Administración/Atención activos pueden registrar notas de cobro. No hay edición libre posterior de recibos o cierres.
- Los reintentos idénticos conservan el pago y la nota originales. Reutilizar una operación ya guardada con otra nota se rechaza.
- Los pedidos de mesa mantienen el consumo antes del cobro. Para llevar mantiene el cobro al registrar.
- Incidencias descubiertas después del cobro pueden anotarse en la observación general del cierre. No se elimina ni compensa una venta automáticamente.

## Implementación

Migración aplicada al Supabase del negocio: `20261103181519_payment_observations.sql`. Añade `observation` a `order_payments` y `order_cash_movements`, inicialmente vacía; cuatro RPC nuevas con autorización y las firmas anteriores disponibles. Amplía la lectura del reporte y de recibos del turno. Los cierres históricos no se recalculan ni se completan artificialmente.

Interfaz: `components/orders/payment-observation.tsx`, `orders-list.tsx`, `order-editor.tsx`, `components/menu/menu-home.tsx` y `components/employee-purchases/purchase-actions.tsx`. Caja/reportes: `components/cashbox/cash-history.tsx`, `cashbox-panel.tsx`, `components/reports/report-view.tsx`, `lib/report-contract.ts`, `cashbox.ts` y `report-xlsx.ts`.

Se comprobaron antes/después las huellas de pedidos, productos vendidos, pagos, movimientos y turnos: coinciden. No se crearon ventas, cobros o aperturas reales para las pruebas. Las definiciones anteriores de las dos funciones de lectura modificadas y los controles están fuera del repositorio, en `outputs/observaciones_2026-11-03/`. Este respaldo de funciones no equivale a un respaldo integral de PostgreSQL.

## Verificación

- PostgreSQL temporal: 79 comprobaciones de permisos, integridad, compatibilidad, notas, reintentos y cierres. No carga credenciales ni conecta a producción.
- Lógica: 52 pruebas aprobadas; incluye Excel con notas como texto literal, montos negativos y hora de Bolivia.
- Navegador: 5/5 pruebas aprobadas, con cobro sin nota y descarte de borradores; cobro de mesa, para llevar, compra de empleado, devolución, reintento y visualización en caja/reportes; las escrituras de negocio se interceptan con datos ficticios.
- Compilaciones QA/entrega aprobadas y prueba de entrega 1/1: Excel real de octubre conciliado y las ocho rutas QA bloqueadas.
- Revisión visual en móvil 390×844 y escritorio 1365×900: texto legible y sin desbordamiento horizontal. El detalle del pedido permite desplazar su contenido hasta Pagar. Los errores del cobro aparecen dentro de la ventana.
- Seguridad posterior a la migración: sin avisos nuevos. Se conservan los avisos anteriores sobre tablas internas sin políticas públicas y protección de contraseñas filtradas deshabilitada.

Comandos: `pnpm test:observations:db`, `pnpm build:qa`, `pnpm test:observations:ui`, `pnpm build:release`, `pnpm test:p15:release --grep "production build excludes"`.

## Guía de revisión

1. Abrir la vista previa actualizada, entrar como Administración o Atención y revisar un pedido que corresponda cobrar.
2. Pulsar Pagar: escribir, por ejemplo, «Producto sustituido por acuerdo con la encargada», elegir Efectivo/QR y confirmar únicamente el dinero recibido. Dejar el campo vacío también es válido.
3. En Para llevar comprobar el mismo campo antes de Cobrar y registrar. Las compras del equipo y los ajustes tienen su propia observación.
4. En Caja y turnos, consultar los movimientos: el pedido debe mostrar su nota. Al cerrar, usar la observación del cierre para incidentes generales del turno.
5. Como administradora, abrir el cierre guardado y desplegar Ver cierre. Las observaciones de sus recibos deben conservarse aunque empiece otro turno.
6. En Historial, consultar la fecha de cobro y cambiar los filtros. Las notas deben corresponder a esos mismos filtros.
7. Exportar Excel: si hay notas, revisar Observaciones. Ventas y Desglose conservan los importes netos.

Publicar la rama genera una vista previa; el dominio de producción requiere integrar el cambio en su rama de producción. No se integra `main` automáticamente.
