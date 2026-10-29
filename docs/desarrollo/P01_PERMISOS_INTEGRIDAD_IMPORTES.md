# P01 — Permisos, integridad de pedidos y contrato de importes

| Dato | Estado al 29/10/2026 |
| --- | --- |
| Rama | `desarrollo/mejoras-octubre-2026` |
| Implementación | Código en rama; migración aplicada al Supabase compartido con autorización de Omar |
| Migración | `supabase/migrations/20261029163703_p01_permissions_integrity_amounts.sql` |
| Base compartida | Aplicada el 29/10; ciclo SQL real probado y revertido, sin ventas de prueba persistentes |
| Publicación | No se hizo push ni despliegue |
| Cierre de P01 | Lecturas/permisos de app y ciclo SQL remoto comprobados; aceptación de Omar y recuperación integral siguen pendientes |

## Alcance implementado

La aplicación consulta el perfil activo al autenticar y en operaciones de lectura del servidor. Las rutas, la navegación y la exportación respetan el mismo criterio de roles. Los perfiles inexistentes, inactivos o con roles desconocidos quedan fuera de la aplicación. Se conservan cookies al redirigir, se preserva el host del navegador y se rechazan destinos externos en el parámetro `next`.

La migración sustituye las políticas efectivas de las nueve tablas y limita las escrituras del cliente. Los pedidos, líneas, cobros y eventos se modifican únicamente mediante funciones que comprueban identidad, perfil activo, rol y estado. Los parámetros antiguos de responsable se conservan por compatibilidad, pero deben coincidir con `auth.uid()`; el actor registrado se deriva de esa sesión. No se utilizan claims editables del usuario para autorizar.

| Operación | Admin | Staff / atención | Cook / cocina | Barista | Inactivo / sin perfil / anon |
| --- | --- | --- | --- | --- | --- |
| Leer catálogo | Sí | Sí | Sí | Sí | No |
| Crear/editar/eliminar catálogo | Sí | No | No | No | No |
| Leer perfil propio | Sí | Sí | Sí | Sí | Perfil propio autenticado, incluso inactivo; sin acceso operativo |
| Leer otros perfiles | Sí | No | No | No | No |
| Cambiar role/active directamente desde el cliente | No | No | No | No | No |
| Crear/editar/confirmar pedido | Sí | Sí | No | No | No |
| Marcar todo el pedido entregado | Sí | Sí | No | No | No |
| Entregar línea café | Sí | Sí | No | Sí | No |
| Entregar línea cocina | Sí | Sí | Sí | No | No |
| Consultar pedidos e importes históricos | Sí | Sí | Solo pedidos operativos abiertos y líneas de cocina | Solo pedidos operativos abiertos y líneas café | No |
| Cobrar/archivar por RPC | Sí | Sí | No | No | No |
| Abrir reportes/exportar | Sí | No | No | No | No |
| Leer eventos | Sí | Sí | No | No | No |
| Leer trabajos de impresión | Sí | No | Sí | No | No |
| Escribir directamente pedidos/pagos/eventos/impresión/contadores | No | No | No | No | No |

La administración de empleados mediante operaciones seguras del servidor pertenece a P05. No se ha habilitado edición propia del perfil ni una pantalla nueva. El administrador y staff pueden consultar ventas cerradas para operar pedidos; restringir la pantalla de reportes no impide deducir totales a partir de los pedidos que tienen autorización de leer.

Las implementaciones con privilegios están en `private`, con `search_path` vacío y nombres de objetos completos. Los wrappers públicos usan `SECURITY INVOKER`; se revocan funciones internas y la operación global `clear_order_history`. Las vistas usan `security_invoker=true`. La pantalla deja de ofrecer “Vaciar historial”. El esquema `private` debe mantenerse fuera de los esquemas expuestos por Data API, como en la configuración local actual. Los permisos de SQL de sus funciones también limitan su uso directo.

Tras aplicar P01 se revisaron nuevamente los asesores remotos: desaparecieron los hallazgos por vistas con privilegios del propietario, funciones privilegiadas públicas y search_path mutable. Persisten la configuración de protección contra contraseñas filtradas y avisos informativos de RLS sin políticas en tablas sin acceso directo. Detalle y límites del respaldo: [aplicación remota](APLICACION_SUPABASE_2026-10-29.md).

## Cobro y concurrencia

- `checkout_order` registra el pago y archiva en una misma transacción. La interfaz utiliza esta operación; no hay dos llamadas separadas para cerrar una venta.
- Un bloqueo de fila sobre la cabecera serializa edición, entrega y cobro. Todas las operaciones toman primero ese bloqueo antes de modificar líneas o pagos.
- Un índice único impide más de un pago por pedido. El reintento con el mismo pedido, medio e información de referencia devuelve el pago existente; un pago diferente se rechaza. No se implementan pagos parciales o divididos.
- Se conservan `register_payment` y `archive_order` para compatibilidad con el frontend original: también validan permisos y estado. Archivar ahora requiere un pago válido; un pedido entregado y sin cobro no puede archivarse.
- Solo se cobran pedidos entregados con productos vigentes. No se cambió todavía el flujo para llevar/pago anticipado.
- Los pedidos pagados/archivados no se reabren ni se editan mediante las RPC. Una línea entregada no se modifica con la RPC de edición. Quitar una línea pendiente la marca `voided`, conserva el evento y la excluye del importe; entregar el pedido no revive líneas anuladas. La interfaz de edición pertenece a P04 y sus reglas definitivas siguen sujetas a D01.

## Contrato de importes

| Nivel | Campo | Significado |
| --- | --- | --- |
| Pedido | `subtotal` | Suma bruta de líneas no anuladas |
| Pedido | `discount_bps` | Descuento en puntos básicos: 1500 = 15 %, 2000 = 20 % |
| Pedido | `discount_amount` | Descuento redondeado a dos decimales una sola vez sobre el subtotal |
| Pedido | `total` | Subtotal menos descuento |
| Pedido | `purchase_type` | `customer` o `employee`; histórico compatible = customer |
| Pedido | `buyer_employee_id` | Comprador empleado, diferente del empleado que atendió; nulo para customer |
| Línea | `line_total` | Precio unitario histórico × cantidad, conservando el campo anterior |
| Línea | `discount_amount` | Parte del descuento asignada a la línea |
| Línea | `net_total` | Bruto menos descuento; cero si está anulada |

Los cálculos TypeScript usan enteros/BigInt en centavos, y PostgreSQL usa `numeric`. Se redondea hacia arriba cuando el resto equivale exactamente a medio centavo. El descuento se reparte proporcionalmente por restos mayores, con desempate por UUID ascendente: la suma de descuentos y netos de las líneas coincide con la cabecera. Se rechazan cantidades fraccionarias, cantidades no positivas, precios NaN y desbordamientos del rango `numeric(10,2)`.

Las nuevas columnas de descuento parten de cero. La migración no recalcula ventas antiguas ni modifica sus precios, importes o responsables. `purchase_type=customer` es el valor técnico de compatibilidad para registros previos; no se infiere que el creador de un pedido fuera su comprador. En nuevas compras de tipo employee, la restricción exige comprador y 20 %. La aplicación aún no ofrece ni asigna compras de empleado o promociones; esos módulos son P06/P07 y sus decisiones de negocio siguen pendientes.

Las vistas de pedidos abiertos leen el total de cabecera, y el reporte de líneas toma netos y excluye anulaciones. La presentación del desglose, los períodos, filtros y agregaciones se implementarán en sus pasos correspondientes. No se ha adelantado un dashboard, una promoción activa ni una exportación Excel.

## PWA y sesión

El service worker v2 conserva recursos públicos y elimina sus cachés antiguas. No almacena HTML autenticado ni usa la portada cacheada como alternativa al navegar sin conexión. En un fallo de red devuelve un mensaje de reconexión. Esto evita reutilizar una página de una sesión previa. El manifiesto y el worker siguen siendo públicos para permitir la instalación.

## Validación reproducible

```powershell
pnpm test:preparacion
pnpm test:p01
pnpm test:p01:db
pnpm build
pnpm test:p01:access
```

| Validación | Resultado / alcance |
| --- | --- |
| Guardas del entorno | 7 pruebas aprobadas; ventas compartidas bloqueadas por defecto |
| Permisos de rutas y cálculos | 7 pruebas aprobadas |
| PostgreSQL temporal | 13 grupos aprobados, con múltiples llamadas por rol y SQLSTATE 42501 para accesos denegados |
| Build / TypeScript | Compilación aprobada |
| Navegación Chrome local | 8 casos aprobados: anónimo/PWA, restricciones staff/cook/barista, admin, inactivo, redirección externa y caché ante fallo de red |
| Ventas por Data API contra el esquema P01 desplegado | No ejecutadas: la migración no está aplicada |
| Dispositivos físicos Android/iOS | No probados en esta entrega |

`test:p01:db` crea un clúster temporal PostgreSQL 17 en localhost con datos ficticios, reproduce las políticas amplias y la vista privilegiada observadas, aplica P01 dentro de una transacción y prueba los roles de base `anon`/`authenticated` con identidades sintéticas. Nunca carga `.env` ni se conecta al Supabase real. Comprueba preservación completa de los campos históricos originales, escalación de rol, manipulación de importes, responsables ajenos, acceso inactivo, reparto de centavos, fallo/reintento y dos conexiones simultáneas. Al terminar detiene y elimina su instancia temporal; si falla conserva diagnóstico. En otras máquinas se indica la carpeta de binarios mediante `P01_PG_BIN`.

Las pruebas de navegador usan Chrome instalado, la aplicación local y las cuentas QA ya autorizadas para autenticar y leer páginas del Supabase actual. No prueban las RPC nuevas contra producción. La prueba del worker inyecta un fallo de `fetch` en el worker y comprueba respuesta 503, ausencia de HTML privado en caché y mensaje de reconexión; no equivale a una prueba completa sin conectividad en teléfonos.

Los scripts SQL antiguos `supabase/tests/00`–`03` representan el contrato MVP anterior, incluido acceso directo a tablas que P01 elimina. La verificación de esta entrega es el runner anterior con su fixture aislado; no se debe cargar el seed original sobre la base compartida.

## Aplicación pendiente y orden de publicación

1. Resolver un respaldo recuperable del destino y revisar nuevamente el esquema efectivo. La comprobación de lectura del 29/10 encontró cero pedidos con pagos duplicados, cero diferencias subtotal/total y cero precios de menú no finitos. La migración vuelve a rechazar duplicados/diferencias al aplicarse.
2. Aplicar solo la nueva migración dentro de una transacción; no ejecutar de nuevo el historial ni forzar que coincidan las nueve migraciones remotas con las antiguas locales.
3. Verificar Data API/ACL y los roles QA mediante clientes con clave pública, revisar advisors y ejecutar un ciclo ficticio de venta con IDs registrados, fallo/reintento y limpieza limitada a esos registros. No usar la clave administrativa para acreditar permisos de usuario.
4. Publicar después el frontend compatible. La rama local ya llama a `checkout_order`; intentar cobrar desde ella antes de aplicar la migración devolverá un error por RPC inexistente. No usar esa rama para ventas reales antes de completar la aplicación.
5. Presentar resultado y observaciones a Omar. P01 no está cerrado ni autoriza comenzar P02 por el solo hecho de pasar pruebas locales.

No se requiere Vercel login para preparar código ni estas pruebas locales. Su configuración debe comprobarse antes de publicar. No se alteraron los indicadores `MAMITA_BACKUP_READY=false` y `MAMITA_ALLOW_SHARED_DB_TESTS=false`.
