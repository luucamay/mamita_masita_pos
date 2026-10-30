# P07 — Compra personal de empleados

| Dato | Entrega del 29/10/2026, Bolivia |
| --- | --- |
| Estado | Implementado y probado; pendiente de revisión de Omar. Sin despliegue web. |
| Rama | `desarrollo/mejoras-octubre-2026` |
| Backend | Supabase compartido `idqgwcrczdqvacxneyui` |
| Migración | `20261030014210_p07_employee_purchases.sql`, ya aplicada mediante el conector. No volver a ejecutarla. |
| Rutas | `/perfil/compras`, `/compras-empleados`, integración en Pedidos e Historial. |

## Reglas confirmadas por Omar

- Todos los roles activos, incluida Administración, pueden comprar para sí mismos.
- El descuento es fijo del 20 %, sin acumular promociones del día.
- Atención o Administración confirma Efectivo/QR. Cocina y Barista no pueden confirmar cobros.
- Las compras cobradas se incluyen también en Pedidos y en los reportes generales, identificadas como **Compra de empleado**. Esta decisión reemplaza la propuesta inicial de excluirlas.
- El servidor obtiene al comprador desde la sesión; el navegador no puede elegir otra persona ni otro porcentaje.

## Funcionamiento entregado

Desde Perfil se abre Mi compra: catálogo activo, búsqueda, categoría, cantidades y resumen de subtotal/descuento/total. Una base de Bs 59 da Bs 11,80 de descuento y Bs 47,20 de total. Los precios mostrados por producto son orientativos; el total de la compra y sus centavos se concilian con el cálculo de servidor.

Enviar crea una compra **pendiente de cobro**, todavía sin ingreso. El empleado se acerca a Atención o Administración para pagar y recibir sus productos. El cobrador abre **Cobros equipo** o **Pedidos → Cobrar compra**, selecciona Efectivo/QR y pulsa **Confirmar cobro y entrega**. Ese paso registra un único pago, su receptor y la entrega; archiva la compra.

Este flujo es de entrega directa: no crea tickets en Cocina/Café ni trabajos de impresión. No representa crédito ni habilita autoaprobación para Cocina/Barista. Administración/Atención puede cobrar una compra propia porque no se exigió una segunda persona distinta.

Las compras pendientes se pueden cancelar por su propietario o Atención/Administración. Se conserva su historia e importe, sin pago. Para cambiar una compra personal enviada, se cancela y se crea otra; el editor P04 conserva su alcance de pedidos de clientes. Una compra cobrada no se cancela ni modifica desde este flujo. Si el comprador fue desactivado, se rechaza el cobro pendiente.

El perfil tiene historial propio. Cobros equipo tiene filtros Pendientes/Cobradas/Canceladas/Todas y paginación por fecha/ID. Cocina/Barista solo accede a sus compras personales; no al historial de otros empleados ni a la pantalla de cobros.

En Pedidos se muestra el distintivo violeta Compra de empleado junto al 20 % y al medio de pago cuando corresponde. Historial y el CSV actual incorporan el tipo de compra y suman el ingreso neto cobrado. Los períodos y el Excel con formato siguen correspondiendo a P09–P12; no se declaran resueltos aquí.

## Código y base de datos

| Área | Ubicación / propósito |
| --- | --- |
| Pantallas | `app/perfil/compras`, `app/compras-empleados`; indicadores de carga propios. |
| Interfaz | `components/employee-purchases/`: carrito, historial y cobro/cancelación compartidos. |
| Datos y contrato | `lib/employee-purchase-data.ts`, `lib/employee-purchases.ts`; catálogo con autorización para los cuatro roles. |
| Integración | `components/orders/orders-list.tsx`, distintivo dedicado; consultas de pedidos, Historial y exportación CSV. |
| Identidad | `lib/auth.ts`, `lib/permissions.ts`: usuario validado y perfil activo actual; caché solo dentro de la petición. |
| Persistencia | Nuevo campo `orders.employee_cancelled_at`, índice de historial y tabla privada de solicitudes idempotentes. Se reutilizan comprador/tipo/descuento de P01. |
| RPC | `create_employee_purchase`, `checkout_employee_purchase`, `cancel_employee_purchase`, `list_employee_purchases`. |
| Protección | RLS, permisos explícitos, wrappers invoker, funciones internas con búsqueda fija, bloqueo de pedido y revisión. Las RPC de clientes rechazan compras de empleado. |

Los reintentos de creación conservan el mismo UUID mientras el carrito no cambia. El servidor comprueba el dueño y el contenido de la solicitud, precios vigentes y productos/categorías activos. Reintentar un cobro ya completado con el mismo medio devuelve el recibo existente; otro medio se rechaza. Las cantidades y los importes se recalculan sin aceptar un total del navegador.

## Validaciones y límites

- **32 grupos SQL acumulados** en PostgreSQL temporal con datos sintéticos: permisos, descuentos, redondeo, precios obsoletos, cancelación, paginación, concurrencia, reintentos y compatibilidad de clientes. P07 se probó antes de ampliar el perfil P08.
- **2 escenarios de navegador P07**: compra Bs 59 → Bs 47,20, reintento con el mismo UUID y cobro QR con control de acceso. Las escrituras del navegador se interceptan; no son cobros HTTP reales.
- **Integración SQL real en Supabase con ROLLBACK**: comprador Cocina, aislamiento frente a Barista, cobro por Atención, repetición sin doble pago y reportes consolidados marcados. Ninguna venta de esa prueba quedó guardada.
- Build QA/TypeScript aprobado, **22 pruebas de lógica** (incluidas fechas, permisos, importes y exportación) y **33 escenarios de regresión de navegador aprobados**, sin omitidos ni reintentos automáticos. El fallo inicial por la espera de 5 segundos del perfil quedó registrado y resuelto en la verificación final; el rendimiento general sigue en P14.
- Revisión visual de compra y perfil a 1280 px y 390 px: sin desbordamiento horizontal; controles de 44 px y acceso al resumen en móvil.
- Evidencia agregada: [verificación Supabase](../../../SUPABASE/evidencias/p07_p08_verificacion_2026-10-29.json), situada en el workspace padre.

Antes de migrar se guardaron diez tablas públicas (10.322 filas), metadatos y hashes privados verificados. Después se compararon las diez huellas: datos anteriores idénticos, excluyendo únicamente el campo nuevo nullable al comparar pedidos. Permanecen **939 pedidos, 938 pagos, 63 productos, 11 perfiles y 0 compras de empleado** al entregar. El respaldo PostgreSQL/Auth integral y la restauración completa siguen pendientes; esta copia no los sustituye.

## Guía de revisión

1. Abrir el proyecto local e ingresar con una cuenta QA activa. Sus credenciales están en el archivo local ignorado `.env.test.local`; no se muestran en este documento.
2. Ir a **Perfil → Comprar con descuento de empleado**. Verificar identidad, 20 %, búsqueda, cantidades y total.
3. Con Espresso Bs 10 + Focaccia Bs 49, verificar subtotal Bs 59, descuento Bs 11,80 y total Bs 47,20.
4. Enviar a cobro y comprobar el historial pendiente. Esta acción manual sí crea una compra en la base compartida.
5. En otra sesión Atención/Administración, abrir **Cobros equipo** o **Pedidos → Cobrar compra**. Verificar comprador y distintivos; seleccionar Efectivo/QR y confirmar cobro y entrega.
6. Actualizar el historial personal: debe mostrar Cobrada y el medio correcto. En Historial de admin, el ingreso incluye Bs 47,20 y la etiqueta Compra de empleado.
7. Crear otra compra pendiente y cancelarla: debe permanecer cancelada, sin pago. Cocina/Barista no debe acceder a Cobros equipo.

Los clics manuales de cobro sí afectan caja y reportes del Supabase compartido. Las pruebas automáticas entregadas evitan ese efecto mediante interceptación o transacciones revertidas.
