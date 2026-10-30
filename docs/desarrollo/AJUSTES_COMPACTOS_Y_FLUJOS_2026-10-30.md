# Interfaz compacta y cobro según el tipo de pedido

Actualización posterior a P14, 30/10/2026, en el proyecto oficial y la rama `desarrollo/mejoras-octubre-2026`. Sin despliegue en Vercel; pendiente de revisión de Omar.

| Área | Implementación |
| --- | --- |
| Menú | Sin título visible repetido, subtítulo POS ni botones de categorías debajo del buscador; categorías desplegables y filas compactas |
| Pedido actual | Mesa por botones 1–7, Para llevar u Otra; mesa personalizada libre, por ejemplo `6.1`; sin subtotal duplicado cuando no hay descuento |
| Cabecera | Mamita Masita y botón Actualizar a la derecha, en móvil y escritorio |
| Pedidos | Menos márgenes; estado de conexión y última lectura junto al título; tarjetas compactas |
| Cerrados | Día actual de Bolivia por defecto, fecha elegible y opción Todo el historial; páginas de 24 |
| Cobros | Mesa al finalizar; Para llevar al registrar, con ajustes y devolución cuando corresponda |

## Reglas confirmadas por Omar

La aclaración de la dueña reemplaza la propuesta inicial de cobrar todos los pedidos al registrarlos:

| Tipo | Secuencia |
| --- | --- |
| Mesa | Seleccionar/escribir mesa → registrar → preparar/entregar y consumir → cobrar Efectivo/QR → archivar |
| Para llevar | Elegir Para llevar → seleccionar Efectivo/QR y registrar el cobro → preparar; editar si hace falta → Entregar y archivar |

Los botones 1–7 son accesos rápidos, no una restricción de la base. **Otra** permite escribir mesas divididas o nombres distintos. El nombre del cliente sigue siendo opcional. Los pagos continúan siendo registros manuales de caja; no se añadió integración bancaria ni QR de cobro.

En Para llevar el pago confirmado se muestra aunque el pedido siga en estado `confirmado`. No se vuelve a cobrar al entregar. Si se modifican productos pendientes después de cobrar:

- Se calcula la diferencia en el servidor conservando el descuento original.
- Si aumenta, se debe confirmar que se recibió la diferencia e indicar Efectivo/QR.
- Si disminuye, se debe confirmar que se devolvió la diferencia e indicar el medio de devolución.
- Si no cambia el total, se conserva trazabilidad del cambio sin otro movimiento neto de dinero.
- El pedido conserva su hora de creación. No se permite modificar una compra ya archivada ni quitar/cambiar líneas entregadas; debe quedar al menos un producto.

El distintivo **Efectivo + QR** identifica pedidos con movimientos por ambos medios, incluidas devoluciones; no implica que ambos saldos netos sean positivos. En mesa siguen funcionando las modificaciones antes de cobrar, conforme a las restricciones de P04.

## Diseño y estructura

Se conserva la tipografía existente y la marca naranja/crema. Se redujeron márgenes, rellenos, cajas y textos repetidos sin reducir los controles principales por debajo de 44 px de alto. Las categorías usan `details/summary` accesibles por teclado; la búsqueda muestra los grupos coincidentes desplegados. No se crean peticiones al escribir una búsqueda local.

El panel del pedido mantiene el total y la acción al pie y una zona desplazable para los productos. El espacio libre con pedidos pequeños pertenece a esa zona flexible; evita que el botón principal quede escondido al crecer el pedido. En móvil el editor coloca nombre, cantidad e icono de quitar en columnas para que el nombre no se comprima en fragmentos.

Se corrigió un reinicio del borrador del editor: un refresco del padre podía pasar una nueva referencia del catálogo y volver a cargar la edición. Ahora la carga depende del pedido o de una recarga explícita, y conserva el borrador durante ese refresco.

Actualizar se centraliza en la cabecera. Pedidos y las colas consumen ese evento y actualizan su lectura sin refrescar toda la ruta. En las otras pantallas, el botón usa el refresco del router. Se retiraron los botones duplicados de actualización dentro de Pedidos y las colas.

`Última lectura` cambia con la lectura confirmada del servidor y comparte fila con `Pedidos`. Se conservan los avisos de desconexión y errores; no se ocultan fallos para reducir texto. La cabecera repetida y el texto guía de las pantallas operativas se redujeron; los controles de permisos, filtros y confirmación de dinero permanecen.

El documento y el manifiesto PWA se llaman **Mamita Masita**. El service worker pasa a caché v3 y deja el manifiesto fuera de la caché persistente para no mantener el nombre anterior. Una instalación existente puede actualizar su nombre según el ciclo de actualización del navegador; no se modificó la aplicación de Windows desde el sistema operativo.

## Cerrados y fechas

Cerrados usa la fecha de archivo, con respaldo en pago/creación para registros antiguos, en `America/La_Paz`. Por defecto consulta hoy; el usuario puede elegir una fecha o marcar **Todo el historial**. Con esta última opción se deshabilita el campo de fecha para evitar confusión. Al cambiar de página se conservan los filtros.

La consulta periódica no fija una fecha implícita: si la vista de hoy permanece abierta al cambiar de día, la siguiente lectura usa el día vigente del servidor. Una fecha seleccionada explícitamente sí se conserva. Los reportes, en cambio, siguen usando la fecha de cobro/movimiento de caja; fecha de cierre y fecha de ingreso no son necesariamente iguales.

## Backend y contabilidad

Migraciones aplicadas al Supabase compartido `idqgwcrczdqvacxneyui`; **no repetirlas manualmente**:

| Versión | Cambio |
| --- | --- |
| `20261030124536_compact_daily_closed.sql` | Nueva RPC `get_orders_board_compact`, fecha y todo el historial; conserva las RPC de lectura anteriores |
| `20261030124544_customer_payment_flows.sql` | Campo nullable `orders.payment_methods`, diario de movimientos, registro idempotente y operaciones de Para llevar; reportes con devoluciones |
| `20261030130832_payment_recorded_at.sql` | Fecha real de registro del cobro después de bloquear/verificar precios y promoción; misma fecha en pedido, pago inicial y movimiento |

`public.place_customer_order` crea el pedido y, en Para llevar, su pago inicial en la misma transacción. Una operación identificada por el mismo UUID y el mismo contenido retorna el pedido existente. En mesa no crea pago. Los reintentos del mismo carrito reutilizan ese identificador; no se presenta esto como persistencia del carrito tras cerrar el navegador.

`public.edit_prepaid_order` bloquea el pedido, comprueba revisión/precios y calcula la diferencia antes de confirmar. Los cambios, el ajuste y su auditoría se confirman juntos o se revierten juntos. El cliente envía la diferencia que mostró, pero el servidor exige coincidencia con su cálculo. `public.deliver_prepaid_order` comprueba la conciliación, entrega y archiva sin generar otro pago.

`public.order_cash_movements` conserva importes firmados, medio, fecha, actor y desglose por producto para los nuevos pedidos prepagados. La fila original de `order_payments` se conserva: una devolución no reescribe el cobro histórico. `private.customer_order_requests` registra las operaciones para reconocer reintentos y rechazar un UUID reutilizado con otro contenido/actor.

Las implementaciones de ítems existentes se conservaron en helpers privados internos sin ejecución para `authenticated`. Los helpers accesibles siguen admitiendo operaciones normales en pedidos sin cobrar y rechazan cambios directos a pedidos pagados: los ajustes deben pasar por la operación que concilia caja. No se emplea una marca de sesión controlable por el cliente ni se borra temporalmente `paid_at` para saltar las guardas.

El diario permite lectura solo a admin/Atención activos mediante RLS, sin escrituras directas para las cuentas de la app. Los mutadores privados validan actor, rol y estado, y usan `search_path` fijo; las funciones públicas son envoltorios `security invoker`. Las políticas y la publicación anteriores no se ampliaron para cocina/barista.

Los reportes y Excel combinan los pagos históricos normales con el diario de los nuevos pedidos prepagados, sin contar dos veces su pago inicial. Un cobro inicial entra en caja sin esperar a la entrega. Un ajuste/devolución pertenece al día en que se registra. Por eso un período puede tener ingreso neto o cantidad neta negativos, y un pedido con medios mixtos puede contarse en ambos medios y una sola vez en el total de pedidos. Las unidades e importes negativos se conservan como números en Excel y concilian con el detalle.

## Conservación de datos y pruebas

Antes de las migraciones se exportaron **10 tablas públicas, 10.361 filas**, y se verificaron los diez SHA-256. Respaldo y metadatos en `SUPABASE/RESPALDOS_PRIVADOS/2026-10-30_compact`, fuera del repositorio. No es un respaldo integral PostgreSQL/Auth ni una restauración integral verificada.

La línea base ya tenía **942 pedidos y 941 pagos**: tres pedidos más que la referencia P14. No se eliminaron. Se recalculó `e2e/report-reference.json` independientemente desde esa exportación, con su procedencia y huellas en `report-reference.provenance.json`. El total mensual de octubre de esa referencia pasó de 6.832 a 7.021 Bs por esos registros existentes, no por modificar la aplicación ni fabricar ventas.

La primera comprobación de huellas tras las migraciones coincidió con la línea base excluyendo la nueva columna nullable de `orders`. Durante la revisión se creó desde la aplicación el pedido **20261030-004, Bs 51, servicio de mesa**, con tres productos. Se conservó sin modificarlo. La comparación posterior por claves confirmó que los 942 pedidos originales, 941 pagos originales, sus líneas y eventos no cambiaron ni se eliminaron; se añadieron ese pedido, tres líneas y cinco eventos. El contador del 30/10 avanzó de 4 a 5 por esa creación. La lectura posterior tenía 943 pedidos, 941 pagos, cero movimientos nuevos de dinero y una solicitud de creación correspondiente al pedido 004. No se confunde esa actividad con los ensayos automáticos ni se borra para recuperar una huella antigua. La comparación detallada está en el respaldo privado `after` y `preservation-comparison.json`.

- **44 pruebas de lógica aprobadas**, incluidas preparación después del pago, estados editables, negativos de devoluciones y celdas Excel numéricas negativas.
- **59 grupos SQL acumulados** en PostgreSQL temporal, incluidos creación cobrada/unpaid, rechazo por rol, ajuste exacto, rollback, devolución, conciliación de productos/caja, reintentos, concurrencia, archivo sin otro pago, filtros diarios devolución en un día posterior y preservación de una promoción del 15 % al ajustar un pedido ya cobrado.
- **55 escenarios de navegador aprobados**, sin omitidos ni resultados intermitentes. Autenticación/lecturas QA reales; escrituras de ventas, ajustes y usuarios simuladas en navegador. Las páginas de fixtures siguen limitadas al build QA y a roles autorizados.
- Dos comprobaciones sobre Supabase actual dentro de transacciones terminadas con **ROLLBACK**: ciclo cobro/adición/devolución/archivo y coherencia de fechas del cobro. No dejan registros confirmados ni trabajos para impresoras.
- Build QA y TypeScript aprobados. Inspección visual real a **390×844** y **1365×900**, con animaciones detenidas al capturar, sin desbordamiento horizontal. Se revisaron menú, carrito, Cerrados y edición con devolución.
- Advisors sin hallazgos nuevos: permanecen seis informativos anteriores de RLS sin políticas y el aviso anterior de protección de contraseñas filtradas deshabilitada.

Las guardas generales de pruebas de ventas compartidas siguen deshabilitadas. Las pruebas de navegador específicas bloquean escrituras reales; no confundir una respuesta simulada con un cobro real. No se validaron Android/iOS físicos ni el dominio Vercel en esta entrega.

## Guía para revisar

1. Abre la versión local actualizada. En Menú ya no deben aparecer el título POS ni los botones Todos/categorías bajo el buscador.
2. Despliega Vitrina pan y otra categoría; busca un producto y comprueba que aparecen sus resultados sin recorrer todo el catálogo.
3. Agrega productos y abre Ver pedido. Elige una mesa rápida o **Otra**, escribe `6.1` y registra: no debe solicitar Efectivo/QR al tomar el pedido de mesa.
4. En Pedidos, verifica ese pedido sin cobrar. Edita si corresponde, entrégalo y registra Efectivo/QR cuando el cliente pida la cuenta: se archiva entonces.
5. Para otro pedido elige **Para llevar**, selecciona Efectivo/QR y pulsa **Cobrar y registrar**. En Activos debe verse como cobrado y seguir disponible para preparación.
6. Antes de entregarlo, abre Editar pedido y agrega un producto. Verifica la diferencia, medio y confirmación de recepción. Prueba también quitar un pendiente y confirmar la devolución correspondiente. No hagas una devolución real únicamente para probar la interfaz.
7. Pulsa **Entregar y archivar**: no debe pedir otro pago. Comprueba Cerrados de hoy y luego el filtro de fecha/Todo el historial.
8. Usa el icono Actualizar a la derecha de Mamita Masita; en Pedidos verifica la última lectura junto al título.
9. En Historial/Excel verifica los ingresos del día, medios y cantidades netas. Una devolución posterior debe aparecer en el día de devolución.

Los pasos de creación/cobro manual sí guardan operaciones en Supabase. Usa registros identificados y no modifiques pedidos del negocio para probar. No hay limpieza automática de esos pedidos manuales.

Esta entrega modifica reglas de pago y lectura de reportes: no debe revertirse solo la web a una versión que desconozca movimientos firmados después de empezar a usar el nuevo flujo. Conservar el diario y las ventas; cualquier reversión necesita revisar los registros que se hayan creado. No se hizo push, integración en main ni publicación; P15 sigue pendiente.
