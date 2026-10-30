# P13 — Pedidos en tiempo real y tiempos del pedido

Implementado el 30/10/2026 en `desarrollo/mejoras-octubre-2026`. Revisión funcional de Omar pendiente. Sin publicación en Vercel.

| Módulo | Resultado | Backend |
| --- | --- | --- |
| Pedidos, admin y Atención | Tarjetas con productos, cantidades, estado, total, identificación de pago/descuento/empleado y dos tiempos | RPC `get_orders_board` y publicación Realtime de `orders` |
| Conexión | Aviso de estado, última lectura, reintento y botón Actualizar pedidos | API privada sin caché; reconciliación tras reconexión |

## Regla confirmada por Omar: D13

- **Preparación:** desde `created_at` hasta `delivered_at` al entregar.
- **Cuenta abierta:** desde `created_at` hasta `paid_at` al cobrar.
- Agregar o cambiar productos conserva el comienzo original del pedido.
- Se admiten duraciones mayores a una hora y a un día. Fechas finales antiguas ausentes muestran **Sin registro**, sin inventar fechas. Las compras canceladas se detienen en su cancelación.

## Implementación y archivos

- `app/pedidos/page.tsx`: lectura inicial coherente de cabeceras y líneas, vistas Activos/Cerrados.
- `components/orders/live-orders.tsx`: suscripción a cambios de `orders` y `order_items`, conexión, reconciliación y reloj compartido de las tarjetas.
- `components/orders/orders-list.tsx`: tarjetas adaptables a móvil, productos y detalle actualizado. Mantiene el pedido seleccionado cuando pasa a Cerrados. Un cambio remoto no sobrescribe un borrador de edición: muestra advertencia para recargarlo. Una respuesta tardía al guardar no vuelve a abrir un diálogo ya cerrado ni reemplaza una selección posterior.
- `components/orders/order-timers.tsx` y `lib/order-board.ts`: cálculo, normalización y representación de tiempos. No se anuncian segundos continuamente a lectores de pantalla.
- `lib/live-refresh.ts`: agrupa eventos durante 250 ms, serializa lecturas y ejecuta otra si recibió eventos durante la anterior; cancela al desmontar y reintenta fallos a los 5 segundos. No aplica respuestas de una instancia descartada.
- `lib/order-board-data.ts`, `app/api/orders/live/route.ts`, `middleware.ts`: lectura autenticada, validación de filtros y respuesta JSON 401/403. API `Cache-Control: private, no-store`. Ante pérdida de acceso limpia las tarjetas y redirige.

Los eventos invalidan la lectura; sus cargas no se usan para calcular importes. Una RPC devuelve el estado autorizado completo, incluyendo detalle seleccionado, orden estable y hora del servidor. Así no se duplican tarjetas ni se mezclan líneas antiguas con cabeceras nuevas. El JSON evita el truncamiento de cabeceras por el límite habitual de filas de PostgREST.

El reloj inicia con la misma hora en servidor y cliente para evitar diferencias de hidratación. Después avanza con `performance.now()`, anclado a la hora de la base más una aproximación de media latencia de ida y vuelta. Cambiar la fecha del dispositivo no altera la duración; la corrección por latencia es aproximada. Se actualiza localmente cada segundo, sin leer ni escribir la base cada segundo.

Al recuperar conexión, foco o visibilidad se consulta el estado vigente. Hay una lectura de respaldo cada 30 segundos mientras la pestaña está visible y conectada. Sin red o con error se conserva la última lectura con aviso; el reloj puede continuar, pero los estados deben confirmarse al reconectar. El usuario también puede actualizar manualmente.

## Supabase

Migración **`20261030102045_p13_live_order_board.sql` aplicada** al proyecto compartido `idqgwcrczdqvacxneyui`; no repetirla manualmente.

- Añade `public.orders` a `supabase_realtime`, conservando la publicación existente de `order_items`, sus columnas y las políticas RLS.
- Crea `public.get_orders_board(boolean,uuid)`, `security invoker`, `search_path` fijo. Solo permite perfiles activos admin/staff; revoca ejecución anónima. No modifica las funciones de cobro, descuentos ni edición anteriores.
- Cocina y Café mantienen sus pantallas. Se probaron permisos de sus suscripciones con identidades independientes: no reciben inserciones/actualizaciones del pedido pendiente privado ni líneas de la otra cola. La publicación nueva sí permite recibir cabeceras autorizadas por sus políticas existentes.
- La comprobación de aislamiento no equivale a afirmar que Realtime filtra eliminaciones por RLS: con identidad de réplica predeterminada, el evento DELETE puede contener la clave primaria. La interfaz trata cualquier evento como invalidación y vuelve a consultar con permisos vigentes.

Antes del cambio se exportaron 10 tablas públicas, **10.322 filas**, con SHA-256 verificado, además de metadatos de esquema/permisos/publicación. Los archivos permanecen en `SUPABASE/RESPALDOS_PRIVADOS/2026-10-30_p13`, fuera del repositorio. Esto **no constituye un respaldo integral PostgreSQL/Auth ni una restauración integral verificada**. Las guardas generales de pruebas de ventas continúan deshabilitadas.

## Verificación

- 38 pruebas de lógica acumuladas, incluidas 6 de P13: duraciones, fechas ausentes/futuras, más de 24 horas, normalización, eventos durante lecturas, pausa, disposición y reintento.
- 44 grupos SQL acumulados en PostgreSQL temporal, incluidos 6 de P13: permisos, publicación, coherencia, detalle pagado seleccionado, más de 1.000 cabeceras y revocación de acceso. No se insertan esas 1.005 cabeceras en la base compartida.
- Regresión de navegador: **45/45 aprobados**, sin omitidos ni resultados intermitentes. Incluye API 401/403/400, recuperación de un 503 y prueba de respuesta tardía al cerrar el editor. Las escrituras de esta regresión son simuladas. TypeScript sin errores y `git diff --check` aprobado; compilación QA separada utilizada por ambas suites.
- **Prueba real dedicada con dos navegadores y Supabase:** creación visible, edición 59 → 79 → 99 Bs con detalle seleccionado, reconexión sin duplicados, fecha del dispositivo fijada en 2020, preparación detenida al entregar, cuenta avanzando y cobro QR con paso a Cerrados. Se observaron 21 tramas Realtime relacionadas con el pedido. Cocina/barista se autenticaron con sus propias cuentas y suscripciones. Capturas móvil de 390 px y escritorio inspeccionadas, sin desbordamiento horizontal.

La prueba real se habilitó exclusivamente para dos UUID registrados en un manifiesto privado. Usó un pedido confirmado y otro pendiente; el navegador bloqueaba escrituras fuera del UUID autorizado. Se insertaron directamente para no consumir numeración diaria. Al terminar se retiraron únicamente esos registros, sus líneas, pago y eventos; se verificaron las huellas de las diez tablas contra la línea base: **todas iguales**. Continúan **939 pedidos y 938 pagos**, sin registros QA residuales ni cambios de contadores o trabajos de impresión.

Durante la verificación inicial se corrigió un fallo real: cerrar el detalle antes de recibir la respuesta de guardado lo reabría. Se incorporó una prueba de regresión. Un primer intento de automatización pulsaba el botón de entrega al hacer clic en el centro de la tarjeta; ahora abre el detalle mediante su encabezado. Otro intento generó un trabajo de cocina QA en estado `queued` por la lógica preexistente de edición; se retiró por su UUID antes de continuar. La prueba final marcó la línea de cocina como ya impresa y no generó trabajos. Todos los intentos quedaron limpiados con comprobación de huellas.

Los avisos de seguridad de Supabase conservan los anteriores: seis avisos informativos de RLS sin políticas y protección de contraseñas filtradas deshabilitada. No se alteró Auth para esta entrega.

## Guía para revisión manual

1. Abre la versión local actualizada. Usa dos navegadores/perfiles: admin en uno y Atención en otro. En ambos entra a **Pedidos → Activos** y espera **En vivo**.
2. Desde Atención crea un pedido identificable de prueba. Sin recargar el navegador admin, comprueba tarjeta, mesa/cliente, productos, cantidades y total.
3. Comprueba que **Preparación** y **Cuenta abierta** avanzan. Edita el pedido desde Atención, agrega un producto y cambia cantidades: admin debe actualizarse sin duplicar tarjeta ni reiniciar el tiempo.
4. Abre el detalle desde el encabezado de la tarjeta en admin; vuelve a editar desde Atención. El detalle abierto debe reflejar los cambios. Si estás editando en ambas sesiones, debe avisar del cambio remoto y conservar el borrador hasta recargar.
5. Desconecta temporalmente la red del navegador admin. Debe avisar que los pedidos pueden estar desactualizados. Modifica desde Atención y reconecta admin: debe recuperar el total vigente sin recargar la página. **Actualizar pedidos** fuerza otra lectura.
6. Marca **Entregado** desde Atención: Preparación queda fija y Cuenta abierta sigue avanzando.
7. Cobra Efectivo o QR: desaparece de Activos y aparece en Cerrados con el medio de pago. Ambos tiempos quedan detenidos; si admin tenía el detalle abierto, conserva ese detalle ya cobrado.
8. Repite la consulta en móvil y cambia de pestaña/retorna: los tiempos conservan el comienzo original.

Estas operaciones manuales sí crean registros en la base compartida; usa únicamente pedidos identificados como prueba. La limpieza automática descrita corresponde a los UUID de la prueba automatizada, no a pedidos manuales posteriores.

P14 (rendimiento general) continúa pendiente. Esta entrega reduce consultas repetidas de detalle y agrupa actualizaciones; no se declara resuelta toda la lentitud de navegación ni se añade paginación al historial cerrado existente.
