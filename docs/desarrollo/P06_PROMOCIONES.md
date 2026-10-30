# P06 — Promociones por día

| Elemento | Resultado |
| --- | --- |
| Pantalla | `/promociones`, acceso Promos exclusivo del administrador |
| Programación | Una promoción general por fecha de Bolivia, editable/desactivable |
| Porcentaje | De 0,01 a 100 %, hasta dos decimales; sin acumulación |
| Pedidos | Conservan su porcentaje original, también al añadir productos después |
| Interfaz | Precio original/descontado, subtotal, descuento, total y distintivo porcentual |
| Supabase | `20261030005743_p06_daily_promotions.sql`, aplicada |
| Datos anteriores | Conservados; sin promoción real activada ni venta ficticia persistente |

Omar confirmó D03 y D04: una promoción general por día y conservación del porcentaje original del pedido. Las fechas se interpretan en `America/La_Paz`. Se programa hoy o una fecha futura; no se modifica una fecha pasada. Desactivar conserva la fila y su auditoría; no se borra. Cambiar una promoción afecta a pedidos nuevos, sin recalcular cuentas anteriores abiertas o cerradas. Un pedido creado antes de la promoción conserva 0 %. La compra personal del empleado sigue siendo P07, pendiente.

## Archivos y reglas

La migración agrega `daily_promotions`, auditoría privada y fecha/revisión de promoción en la cabecera. Las filas anteriores reciben campos de procedencia nulos: no se reescriben importes, precios, fechas ni estados. Las nuevas órdenes toman el porcentaje en servidor, con desglose y reparto exacto de centavos del contrato P01. Los eventos permiten conocer qué programación se aplicó. Los wrappers públicos son invoker; las operaciones privilegiadas internas comprueban el perfil activo, rol y actor, con search_path fijo. El cliente solo puede leer la tabla de promociones siendo admin; todas las escrituras pasan por la RPC validada.

`admin_save_daily_promotion` usa bloqueo breve por fecha y revisión para impedir sobrescribir una edición concurrente. Una repetición con el mismo porcentaje/estado devuelve el registro sin duplicar auditoría. La clave primaria impide dos promociones para la misma fecha.

`get_order_pricing_context` devuelve el día, descuento, revisión y vencimiento determinados por el servidor. El menú los recibe junto con los productos al renderizar; actualiza al volver a la pestaña, cada minuto y al vencer el día. Si no se puede verificar, confirmar se bloquea y se ofrece actualizar. No hay escrituras alternativas al esquema anterior.

`create_order_with_promotion` verifica fecha, revisión, porcentaje y precios esperados antes de crear. Si cambiaron, revierte y exige revisar; no confirma automáticamente con un total distinto. Los precios de catálogo se bloquean en lectura durante la validación/inserción. El porcentaje aplicado lo obtiene el servidor; el enviado por el cliente es solo una precondición. También se actualizó la creación antigua para que no permita eludir la promoción. P04 reutiliza el porcentaje guardado de la orden y el precio histórico al cambiar cantidades; nuevos productos usan precio vigente y descuento original.

En el menú, el precio individual descontado es una referencia por unidad. El total se redondea sobre el pedido completo y las líneas reparten los centavos; con cantidades/importes mínimos puede diferir un centavo de multiplicar precios individuales redondeados. El carrito muestra el cálculo completo y la lista posterior obtiene el importe definitivo del servidor. El detalle y el recibo usan netos de las líneas y desglose. Las listas de pedidos leen cabecera e IDs/estado de líneas, evitando traer el detalle completo de cada venta cerrada solo para contar sus productos.

Principales archivos: `components/promotions/promotions-panel.tsx`, `app/promociones/page.tsx`, `lib/promotions.ts`, `lib/promotion-data.ts`, `lib/use-pricing-context.ts`, `components/menu/menu-home.tsx`, `lib/orders.ts`, `components/orders/discount-badge.tsx`, detalle/editor y migración. Se conservó la identidad visual naranja del POS; formulario y lista en escritorio, una columna en móvil. Se ajustó la navegación para mantener Promos/Salir accesibles y el producto para evitar superponer precios y controles con el carrito abierto.

**Ajuste solicitado por Omar:** el distintivo de descuento incluye el icono de etiqueta utilizado en Promos, porcentaje visible y nombre accesible. En la tarjeta del pedido se agrupa junto a Efectivo/QR/Sin cobrar; en el detalle acompaña al desglose del descuento. El grupo permite salto de línea en móvil. Sin descuento no se muestra el distintivo. No cambia cálculos ni base de datos.

## Verificación realizada

- **SQL local:** 24 grupos acumulados: 13 P01, 4 P04 y 7 P06. Incluyen roles, 40 → 34, precio modificado, conservación del porcentaje, edición de cantidades/agregar/quitar, desactivación, fechas inválidas, medianoche de Bolivia, reintento y edición concurrente.
- **Lógica:** tres pruebas P06; 21 pruebas totales de lógica aprobadas junto con las anteriores. Tipos y build QA aprobados.
- **Interfaz P06:** cuatro casos aprobados. Programar/editar/desactivar con respuestas simuladas; cambio de promoción al confirmar conserva borrador y actualiza 34 → 32; porcentaje inválido y acceso staff bloqueados; carga real de Promociones y Menú. La prueba inicial de login agotó cinco segundos mientras aún ingresaba; se amplió la espera de esa navegación y se repitió con éxito. Capturas escritorio/móvil revisadas, sin desbordamiento y sin superponer precios/cantidades.
- **Supabase real:** programación temporal al 15 %, orden de dos Cappuccino de Bs 40 a Bs 34, cambio de programación al 20 %, agregar Espresso al pedido original → Bs 42,50 conservando 15 %, rechazo de cotización obsoleta, entrega/cobro y neto del reporte. Toda la transacción terminó en **ROLLBACK**: no se guardaron promociones ni pedidos/pagos/eventos/contadores de prueba. La prueba de formulario de escritura por HTTP fue simulada; el backend remoto se comprobó con SQL y la pantalla con lecturas reales.

Comandos: `pnpm test:p06`, `pnpm test:p06:db`, `pnpm build:qa`, `pnpm test:p06:ui`. La regresión común usa `pnpm exec playwright test --config playwright.regression.config.ts`; excluye la suite de altas reales y el runner general de ventas.

Las rutas `/qa-preview/promotions` y `/qa-preview/promotion-menu` están limitadas al build QA y al rol apropiado. La segunda admite una cookie solo para el porcentaje ficticio de la captura; ninguna de estas rutas omite las validaciones de guardado de la base. No están disponibles en la compilación normal.

## Datos, acceso y límites

Copia previa nueva de nueve tablas (10.322 filas), hashes verificados y definición anterior de creación guardada en `SUPABASE/RESPALDOS_PRIVADOS/2026-10-29_p06`. La recuperación integral PostgreSQL/Auth sigue pendiente; no se cambió `MAMITA_BACKUP_READY` ni se habilitaron ventas E2E generales. Se alineó el nombre local de migración con la versión asignada por el conector. No hubo push ni despliegue Vercel.

Un diagnóstico de fallo de login incluyó la contraseña de la cuenta administradora **QA**. Se rotó mediante Admin Auth API, se actualizaron `.env.test.local` y el manifiesto privado de QA y se sanearon diagnósticos locales; se verificó nuevamente el login. No se modificaron credenciales del negocio. Utilizar los valores actuales del archivo privado; no copiar contraseñas de mensajes o diagnósticos anteriores.

Los asesores conservan solamente los avisos previos de [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) en tablas internas sin acceso directo y [protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambió la configuración de Auth. Referencia de implementación: [funciones de base de datos](https://supabase.com/docs/guides/database/functions).

## Guía para Omar

1. Entrar como QA admin en `http://localhost:3000` y abrir **Promos**. Al entregar no hay descuentos activados.
2. Elegir hoy, ingresar **15** y guardar con Promoción activa marcada.
3. Ir a **Menú**, buscar Cappuccino y agregar dos. Comprobar precio original, porcentaje y total **Bs 34** sobre Bs 40.
4. Si vas a confirmar, usar una mesa/nombre identificados como prueba; la base es compartida. Abrir ese nuevo pedido y revisar distintivo, subtotal, descuento y total.
5. Cambiar la promoción de hoy al **20 %**. El pedido anterior conserva **15 %**, incluidos productos añadidos con Editar pedido. Los nuevos usan 20 %.
6. Volver a Promos, desmarcar Promoción activa y guardar para terminar la revisión. El menú vuelve al precio normal; los pedidos anteriores mantienen su descuento.
7. Probar una fecha futura: no cambia el precio de hoy. Un empleado de Atención no debe ver Promos ni poder programar descuentos.

El sistema conserva las ventas que confirmes manualmente; las pruebas automáticas descritas evitaron dejar ventas ficticias persistentes. P07 no se inició.
