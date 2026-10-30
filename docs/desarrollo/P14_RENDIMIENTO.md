# P14 — Rendimiento y reducción de consultas

Entrega del 30/10/2026 en `desarrollo/mejoras-octubre-2026`. Sin despliegue en Vercel; pendiente de revisión de Omar.

| Área | Cambio | Datos y permisos |
| --- | --- | --- |
| Pedidos cerrados | 24 tarjetas por página, total de registros, navegación Anteriores/Siguientes | Todo el historial sigue accesible; activos completos |
| Cocina y Café | Lecturas agrupadas por eventos, API ligera y respaldo cada 30 segundos | RLS y roles vigentes; pausa sin conexión o en segundo plano |
| Acceso compartido | Auth y perfil en paralelo; una verificación por petición API | Se conserva `getUser()` y perfil activo actual |
| Diagnóstico | Medición antes/después y cabecera Server-Timing | Solo lecturas secuenciales QA, sin prueba de carga |

## Línea base y criterio de revisión

Se midió la compilación de producción local de P13 y después la de P14, usando `.next-qa`, puerto 3101, Chrome de escritorio, misma máquina/red y las mismas diez tablas públicas. Había **939 pedidos, 938 pagos y 2.224 líneas**. La primera ronda calienta rutas; se conserva cada muestra y se comparan medianas posteriores. No se presenta la velocidad de `pnpm dev` como la de Vercel.

El criterio técnico de esta entrega es reducir al menos 90 % los bytes de la primera página de Cerrados, al menos 50 % su mediana de apertura y al menos 80 % la frecuencia de consultas periódicas de Café. No es una garantía de latencia para toda ruta o conexión; la aceptación funcional de Omar sigue pendiente.

| Medición | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| Abrir Cerrados | 2,158 ms | 508 ms | 76.5 % |
| API Cerrados, tiempo completo | 1,700 ms | 347 ms | 79.6 % |
| API Cerrados, tamaño JSON | 1,935,782 bytes | 55,706 bytes | 97.1 % |
| Cambiar período en reportes | 1,013 ms | 593 ms | 41.5 % |

Café: **3 recargas completas en 16 segundos → 0**. Este contador mide peticiones de la página `/cafe`, no todas las peticiones GET. El respaldo de la nueva API es cada 30 segundos (83,3 % menos frecuencia que cada 5), además de eventos/reconexión/foco. No se promete una cuota fija de solicitudes durante actividad. Los 12 cambios de período siguen siendo 12 navegaciones de documento: se conserva el flujo GET anterior.

| Navegación principal, mediana | Antes | Después |
| --- | ---: | ---: |
| /cocina | 905 ms | 882 ms |
| /cafe | 896 ms | 904 ms |
| /pedidos | 904 ms | 894 ms |
| /historial | 928 ms | 883 ms |

**No se demostró una mejora general clara entre las pestañas principales**: permanecen alrededor de 0,9 segundos; las variaciones pequeñas no acreditan una reducción reproducible. La mejora comprobada está en Cerrados, sus lecturas, cambios de período y eliminación de recargas periódicas completas. No se atribuye toda demora restante a PostgreSQL ni se promete que las pantallas sean instantáneas.

Los tres criterios técnicos de revisión se cumplieron con este dataset; no sustituyen la aprobación funcional de Omar.

Datos completos: [antes](evidencias/p14-before.json), [después](evidencias/p14-after.json). Comando reproducible: `node scripts/measure-p14.mjs before` o `after`, con servidor QA 3101 ya iniciado. Cada ejecución abre y cierra únicamente sus navegadores y no inicia el servidor. Las credenciales QA se cargan del archivo local ignorado; no se imprimen.

Las mediciones de navegador incluyen red real, comprobación de acceso, consulta, transferencia y representación. No deben interpretarse como tiempo SQL puro. En una muestra separada de **EXPLAIN ANALYZE con rol QA admin**, la función completa anterior tardó **254,226 ms** y la página nueva **37,120 ms**; dejaron de aparecer escrituras/lecturas temporales en esa muestra. Son dos observaciones de plan, no una mediana SQL ni una prueba de carga.

Las API de pedidos y colas añaden `Server-Timing`: `access` corresponde a identidad/perfil y validación, `data` a la llamada de datos con su red, y `encode` a construir la respuesta JSON. El dato `data` no equivale a ejecución interna de PostgreSQL. El script guarda esa cabecera cuando está disponible. Los tiempos Navigation Timing del documento separan primera respuesta, final del flujo y DOMContentLoaded; el tiempo de descarga de HTML transmitido por partes también incluye espera del servidor y no representa toda la hidratación de React.

## Qué cambió

### Historial cerrado acotado

`public.get_orders_board_page(boolean,uuid,integer)` filtra y ordena las cabeceras antes de construir el JSON de líneas. Cuenta todos los cerrados y devuelve como máximo **24**, más el detalle seleccionado si está fuera de la página. El orden usa fecha de pago/creación e ID para desempatar. Las páginas fuera del rango se ajustan a la última; parámetros inválidos se rechazan en API y la página muestra un aviso con la primera página.

Los activos continúan completos y reutilizan la RPC P13. La función P13 `get_orders_board` se conserva sin modificaciones para compatibilidad con la web que todavía está publicada. No se eliminaron pedidos ni se recortaron reportes o exportaciones. API, lectura inicial y suscripción usan la misma página; cambiar de página reinicia la selección, no las fechas de los pedidos.

Se usa paginación por número/offset para este volumen y sus 40 páginas, contando y seleccionando las cabeceras en una consulta coherente. Si se registran nuevos cobros al navegar, las posiciones pueden desplazarse entre lecturas; no es una copia congelada del historial. Para volúmenes muy superiores se debe volver a medir y considerar cursores. El índice existente de `order_items(order_id)` ya permite leer las líneas de los pedidos seleccionados; no se añadieron índices sin evidencia de necesidad.

### Actualización de colas

`useLiveQueue` agrupa cambios durante 250 ms y serializa las lecturas con el controlador probado en P13. Escucha tanto líneas como cabeceras: confirmar/cerrar un pedido puede cambiar su visibilidad sin insertar productos. Los eventos invalidan la lectura; la información mostrada procede de la API autorizada.

Café deja de llamar `router.refresh()` cada cinco segundos. Ambas colas usan una petición GET pequeña, con una comprobación de acceso, y respaldo cada **30 segundos** solo si hay conexión y la pestaña está visible. También actualizan al recuperar red, foco, visibilidad y suscripción. Los errores conservan la última lectura con aviso; se puede pulsar **Actualizar cola**. Una pérdida de permisos limpia los datos y redirige. Se limpian canales, eventos, temporizadores y lecturas del componente al salir.

Si RLS retira la visibilidad de una fila, puede no llegar su evento de actualización a Cocina/barista. En ese caso la cola se reconcilia con el respaldo de 30 segundos o con **Actualizar cola**. Esta entrega no promete entrega instantánea de todos los eventos ni cambia las políticas para enviar datos fuera de los permisos del rol.

Entregar un producto conserva la RPC de escritura anterior y actualiza únicamente la cola. Se mantienen sonidos y notificaciones existentes; el rol de Café llega del servidor y ya no requiere otro par de consultas de Auth/perfil en el navegador. Pedidos también evita la lectura inicial duplicada: reconcilia al suscribirse y conserva su respaldo periódico.

### Acceso vigente sin espera secuencial innecesaria

La firma del JWT se verifica con `getClaims()` para obtener solo el ID de búsqueda. A continuación `getUser()` y la lectura del perfil se ejecutan en paralelo. Solo se devuelve acceso si Auth confirma ese mismo ID y el perfil actual está activo. El rol procede de la base; no de metadatos editables ni de una cabecera del navegador.

No se cachean permisos entre solicitudes, precios, reportes ni ventas. La memoización de React permanece limitada a Server Components. Las API pasan su acceso recién verificado a la lectura de datos para evitar que la guarda se ejecute otra vez: React `cache` no deduplica estas llamadas fuera del árbol de componentes.

Se retiró el `router.refresh()` inmediato posterior al `router.replace()` del login: la navegación ya consulta la ruta de destino con la sesión nueva. No se modifica el cierre de sesión ni se retiran guardas de páginas o RLS.

Los reportes mantienen su navegación GET estable de P09–P12, sus filtros, cifras y Excel. Una variante de navegación cliente no superó la comprobación y fue retirada; no forma parte de esta entrega. Reportes se beneficia de la mejora de acceso compartida, sin introducir caché de ingresos ni cambiar su contrato.

## Archivos principales

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/migrations/20261030110916_p14_read_performance.sql` | RPC paginada compatible con P13 |
| `lib/order-board.ts`, `lib/order-board-data.ts` | Contrato, validación de página y lectura autorizada |
| `app/pedidos/page.tsx`, `components/orders/live-orders.tsx` | Página actual, navegación y reconciliación |
| `lib/active-access.ts`, `lib/auth.ts` | Identidad y perfil en paralelo con comprobación final |
| `app/api/orders/live/route.ts`, `app/api/queues/live/route.ts`, `middleware.ts` | API privada, 401/403 JSON y tiempos de diagnóstico |
| `lib/use-live-queue.ts`, `components/queue-status.tsx` | Actualización, pausa, errores y reintento de colas |
| `lib/cafe.ts`, `lib/kitchen.ts`, páginas/componentes de colas | Lectura única y acciones existentes |
| `app/login/page.tsx` | Evitar navegación/refresh simultáneos |
| `scripts/measure-p14.mjs`, pruebas `performance` | Evidencia de velocidad, permisos y conservación de datos |

## Supabase y verificación

Migración **`20261030110916` aplicada** al proyecto compartido `idqgwcrczdqvacxneyui`. No ejecutarla manualmente de nuevo. Solo añade una función de lectura, `security invoker`, `search_path` fijo, ejecución autenticada y autorización admin/staff activo. No cambia tablas, políticas RLS, publicación Realtime, pagos, precios ni funciones de escritura anteriores.

Se exportaron nuevamente diez tablas públicas, **10.322 filas**, con SHA-256 de los diez archivos comprobado, y metadatos antes del cambio. Están en `SUPABASE/RESPALDOS_PRIVADOS/2026-10-30_p14`, fuera del repositorio. Esto no es un respaldo integral PostgreSQL/Auth ni una restauración integral verificada. Las guardas generales de pruebas de ventas siguen deshabilitadas. P14 no crea ventas reales de prueba ni modifica empleados del negocio.

- **41/41 pruebas de lógica acumuladas**, incluidas tres P14: rechazar identidad no confirmada o distinta/perfil inactivo, ejecutar Auth/perfil en paralelo y validar páginas/contrato.
- **48 grupos SQL acumulados** en PostgreSQL temporal aislado: permisos, páginas completas sin duplicados ni diferencias de contenido frente a P13, detalle fuera de la página, ajuste de página y conservación de más de 1.000 activos. Las 55 cabeceras cerradas sintéticas y los más de 1.000 activos nunca se insertan en la base compartida.
- **50/50 escenarios de navegador aprobados**, sin omitidos ni resultados intermitentes: regresión anterior más cinco P14. Lecturas y autenticaciones QA reales; escrituras de negocio simuladas. Se verificaron página 1/2/final, conservación de detalle, permisos Cocina/Café, pausa oculta/sin red, recuperación de errores y ausencia de recarga del documento.
- Para los eventos de cola, se mantuvo una suscripción real al servicio y se inyectaron localmente tramas sintéticas en el navegador: 20 cambios se agrupan y una modificación solo de cabecera también provoca lectura. Esto no es una venta real ni una nueva prueba de WAL de cobro; la prueba real de P13 sigue documentada en su entrega.
- Build QA y TypeScript aprobados; `git diff --check` sin errores. Paginación móvil inspeccionada a 390 px y sin desbordamiento; el estilo existente de tarjetas se conserva.
- Las pruebas iniciales se corrigieron para no pulsar un botón tapado por un diálogo y no comparar `performance.timeOrigin` después de instalar el reloj simulado. Se usa recuperación de foco y una marca de documento para comprobar la ausencia de recarga.

Las huellas de las diez tablas públicas coinciden con la línea base, y se comprobó que RLS, publicación y definición de la RPC P13 no cambiaron. Advisors de seguridad sin avisos nuevos: permanecen los seis informativos anteriores de RLS sin políticas y el aviso anterior de protección de contraseñas filtradas deshabilitada.

## Guía de revisión de Omar

1. En el proyecto oficial inicia `pnpm dev` si no está activo y abre la versión local. Para valorar velocidad sin compilación de desarrollo, usa una versión compilada; no ejecutes `pnpm build` a la vez que `pnpm dev` porque comparten `.next`. QA utiliza `.next-qa` por separado.
2. Con administrador o Atención entra a **Pedidos → Cerrados**: debe mostrar 24 tarjetas y el total del historial, sin descargar todas las tarjetas.
3. Pulsa **Siguientes** y **Anteriores**. Abre un detalle desde el encabezado de su tarjeta; verifica productos, total y medio de pago. La última página también es accesible; recargar conserva la página de la URL.
4. Cambia entre **Cocina**, **Café**, **Pedidos** e **Historial**. La barra permanece disponible. Las pantallas que esperan datos muestran su estado de carga.
5. En Cocina/Café espera **En vivo** y pulsa **Actualizar cola**. Desconecta y reconecta la red: debe avisar y recuperar la lectura. Con error temporal conserva lo último mostrado. Cambiar de pestaña y regresar fuerza reconciliación.
6. Desde otra sesión crea o modifica únicamente un pedido que identifiques como prueba y verifica que llega a la cola correspondiente. Entregarlo debe retirar el producto sin recargar todo el documento. Esa prueba manual sí registra operaciones en Supabase.
7. En **Historial**, compara Diario/Semanal/Mensual y filtros QR/Efectivo con sus totales; descarga Excel y verifica que conserva el mismo período/filtros. Los reportes continúan comenzando por hoy.

La prueba manual del punto 6 crea datos nuevos; no se borran automáticamente. Las comprobaciones automatizadas de P14 usan lecturas reales y simulan cambios en navegador/PostgreSQL temporal.

Para volver al código P13, usar su commit `cf0ae62` conserva compatibilidad con Supabase: la RPC anterior sigue disponible. No hace falta restaurar ventas ni reaplicar migraciones para esa reversión de código. No eliminar la nueva función mientras existan clientes P14 que la utilicen.

P15 no se ha iniciado y no se ha hecho push, integración en main ni despliegue. Falta revisión funcional de Omar y verificación posterior en el dominio de entrega; las medidas locales no garantizan el mismo resultado en Vercel o en teléfonos físicos.
