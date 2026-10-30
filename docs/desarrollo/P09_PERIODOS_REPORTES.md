# P09 — Períodos y consulta de reportes

| Dato | Entrega del 30/10/2026, Bolivia |
| --- | --- |
| Ruta | `/historial`, exclusiva de Administración. |
| Inicio | Solo hoy en Bolivia; nunca todo el historial por defecto. |
| Períodos | Diario, semana de lunes a domingo, mes calendario. |
| Fecha contable | `order_payments.paid_at`; no la fecha de creación del pedido. |
| Base | Migración `20261030041017_p09_sales_report_periods.sql`, aplicada al Supabase compartido. |
| Publicación | Código en rama de desarrollo, sin despliegue Vercel. Revisión de Omar pendiente. |

## Reglas y alcance

Omar confirmó día de Bolivia, semana de lunes a domingo y mes calendario. También confirmó la opción de conservar el resumen de caja del período/tipo de compra elegido y filtrar por medio de pago solo el detalle. Recalcó que la vista inicial debe mostrar únicamente hoy. Los períodos mayores se solicitan expresamente; no se suma todo el historial.

Los límites son inicio incluido y siguiente día/semana/mes excluido, convertidos desde `America/La_Paz`. Una venta creada ayer pero cobrada hoy entra en hoy. Para ingresar al reporte necesita un pago y estado pagado/archivado; las compras pendientes, canceladas y líneas anuladas no generan ingresos.

Se agregaron fecha de referencia, Anterior/Siguiente, Hoy, filtros Todos/Efectivo/QR/Otros y Todas/Clientes/Empleados. Los tabs mantienen fecha y filtros. Los controles de navegación del reporte usan enlaces/formularios GET, sin precargas de consultas para cada alternativa. Las primeras pruebas con navegación parcial de Next conservaron la pantalla anterior; se sustituyeron esos controles por navegación GET completa. No se atribuye resuelta toda la navegación de la app: P14 sigue pendiente.

Los productos se agrupan en todo el período por ID, nombre histórico, medio y tipo de compra, sin agrupar por hora de creación. Se suman unidades e ingresos netos históricos, no precios actuales del catálogo. Si hubo varios precios base para un producto, el precio unitario muestra **Varios**; el ingreso sigue siendo exacto. El distintivo Compra de empleado permanece y estas compras se incluyen por defecto, según P07.

## Contrato técnico

| Archivo / objeto | Función |
| --- | --- |
| `public.get_sales_report(text,date,text,text)` | Una consulta de lectura, con permisos invoker, validación de admin activo y filtros. Devuelve rango, resumen, totales filtrados y filas agregadas. |
| Índice `order_payments_paid_at_idx` | Búsqueda de pagos por intervalo sin convertir la columna indexada a fecha. |
| `lib/report-filters.ts` | Validación, fechas, períodos y URLs compartidas. |
| `lib/report-contract.ts` | Tipos y normalización del resultado. |
| `lib/reports.ts` | Lectura de la RPC con sesión de la administradora; sin clave administrativa. |
| `components/reports/report-view.tsx` | Filtros, navegación, rango explícito y detalle de productos. |
| `app/historial/page.tsx`, `loading.tsx` | Entrada protegida y espera de carga. |
| `app/historial/export/route.ts` | CSV existente ajustado para consultar exactamente los filtros de pantalla. Excel con formato permanece en P12. |

La RPC devuelve un único JSON agregado; los límites de filas de PostgREST no cortan el conjunto de productos. Se probó con **1.005 grupos distintos**. Los pedidos/importes del resumen se cuentan desde pagos, antes de unir líneas, para no multiplicar una venta por sus productos. Resumen y detalle salen de la misma consulta y snapshot de PostgreSQL. La exportación es una nueva lectura con los mismos filtros; puede cambiar si se cobran ventas entre pantalla y descarga.

No se modificaron las vistas antiguas, tablas de ventas, importes ni políticas de los módulos anteriores. Las nuevas consultas utilizan la RPC. Los filtros inválidos muestran error; no se presentan ceros como si la consulta hubiera tenido éxito. El export rechaza parámetros repetidos/fechas inválidas y usuarios sin permiso.

## Datos conservados y respaldo

Antes de aplicar se guardó una nueva copia privada de diez tablas públicas (10.322 filas), definiciones/ACL y huellas de datos en `SUPABASE/RESPALDOS_PRIVADOS/2026-10-30_p09`. SHA256 verificado para los diez archivos. La migración añade solo función e índice; no usa seeds ni actualiza ventas. El respaldo PostgreSQL/Auth integral y su restauración siguen pendientes; esta copia no los sustituye.

Los asesores posteriores mantienen los avisos previos de [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) en tablas internas sin acceso directo y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambió Auth. Referencia técnica consultada: [funciones de base de datos](https://supabase.com/docs/guides/database/functions).

## Pruebas

- Tres pruebas de lógica: filtros inválidos, fechas bisiestas, cruces de año/mes, URLs compartidas.
- 38 grupos SQL acumulados: compatibilidad P01/P04/P06/P07 y seis grupos P09. Cubren medianoche, compra de empleado, descuento, tarjeta, precio mixto, anulaciones, ausencia de ventas, permisos y más de 1.000 grupos.
- Lectura remota con identidad QA admin: 17/10 = Bs 54 / 1 pedido / 4 unidades; 12–18/10 = Bs 689 / 11 pedidos / 40 unidades; octubre = Bs 6.832 / 150 pedidos / 442 unidades. Coincide con un cálculo independiente desde la copia previa de pagos y líneas.
- Los casos de navegador comprueban los mismos períodos, filtros, exportación y errores contra Supabase real mediante lecturas. No se insertan ventas desde estos tests.

Comandos: `pnpm test:p09`, `pnpm test:p09:db`, `pnpm build:qa`, `pnpm exec playwright test --config playwright.reports.config.ts`. El build QA está separado del servidor local en `.next-qa`; las ventas E2E generales siguen deshabilitadas.

## Guía para Omar

1. Ingresar como admin y abrir Historial: debe mostrar hoy en Bolivia. Si hoy no hubo cobros, debe indicar ausencia de ventas.
2. Elegir 17/10/2026 y Aplicar filtros: verificar Bs 54, 1 pedido y 4 unidades en el detalle.
3. Pulsar Semanal: rango 12–18/10 y Bs 689; Mensual: 01–31/10 y Bs 6.832.
4. Volver a Semanal, elegir QR y aplicar: detalle Bs 380. El resumen P10 conserva Bs 689 del período.
5. Exportar CSV y comprobar que contiene solo QR del rango seleccionado. Excel con formato se implementará en P12.
6. Seleccionar Empleados: al entregar todavía no hay compras de empleado guardadas, por lo que ese detalle es vacío.
7. Pulsar Hoy: regresa a la fecha actual, conservando los otros filtros elegidos. En móvil, la tabla se desplaza horizontalmente dentro de su contenedor.
