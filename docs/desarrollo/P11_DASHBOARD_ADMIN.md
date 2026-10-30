# P11 — Dashboard principal de administración

| Dato | Entrega del 30/10/2026, Bolivia |
| --- | --- |
| Inicio admin | `/historial`: hoy en Bolivia, con el resumen P10. La raíz redirige allí para admin. |
| Inicio operativo | Atención conserva `/`, Cocina `/cocina` y Barista `/cafe`. |
| Tomar pedido | Botón y entrada Menú de admin apuntan a `/menu`, sin perder el flujo de clientes. |
| Base | Sin migración ni modificación de datos: reutiliza `get_sales_report` de P09. |
| Estado | Implementado y probado antes de P12; pendiente revisión de Omar. Sin despliegue. |

## Resultado

Historial y reportes es también el dashboard de la administradora. Se reutiliza una sola pantalla y una sola consulta, evitando mantener dos fuentes de cifras. Al iniciar sesión sin destino específico o abrir la raíz con sesión admin, se llega al resumen de hoy. Los enlaces válidos a otras pantallas conservan su destino.

La tabla principal muestra **Ítem, Cantidad e Ingreso total** para el período y filtros elegidos. Combina las ventas de cada producto entre medios de pago y tipos de compra, sumando unidades y centavos netos. Agrupa por ID y nombre histórico: cambiar el precio no crea otro producto; un ID o nombre histórico diferente sí permanece separado.

Cuando un producto incluye compras de empleados, una nota muestra sus unidades e ingreso dentro del total. El detalle anterior por precio base, pago y tipo de compra permanece en **Ver desglose por pago y tipo de compra**, accesible con teclado. No se altera la regla P10: el filtro de pago afecta detalle/exportación y los cuadros conservan la caja del período/tipo de compra.

El botón **Tomar pedido** abre el menú completo para admin. Atención mantiene su inicio y permisos, y Cocina/Barista siguen en sus colas. El perfil de admin regresa al dashboard con Volver al trabajo. Las validaciones de rol siguen en servidor, además de la navegación visible.

## Archivos

| Ubicación | Cambio |
| --- | --- |
| `app/page.tsx`, `lib/permissions.ts` | Destino de admin y permiso de `/menu`. |
| `app/menu/page.tsx`, `components/menu/menu-page.tsx` | Menú compartido, con los cálculos de promociones existentes. |
| `components/app-shell.tsx` | Entrada Menú de admin y selección de ruta sin confundir Menú con Admin menú. |
| `lib/report-products.ts` | Agregación por producto con centavos enteros y desglose de empleado. |
| `components/reports/product-sales-table.tsx` | Tabla principal adaptable a móvil. |
| `components/reports/report-view.tsx` | Acceso al menú, tabla principal y detalle desplegable. |

## Verificaciones

Tres pruebas de lógica: 2 Cappuccino por Bs 34, combinación con empleado, conservación de ID/nombre/precios históricos, suma exacta de centavos y destinos/permisos. Build QA/TypeScript aprobado. Siete escenarios de navegador aprobados: tres P11 y cuatro de períodos/sumas P09/P10, con cuentas QA y lecturas reales. No se registran ventas. La regresión final con P12 se documentará en su entrega.

**Verificación final con P12:** 42/42 escenarios de regresión aprobados y nueve afectados repetidos después del último ajuste de Excel, todos aprobados; 32 pruebas de lógica acumuladas. Escritorio y móvil de 390 px revisados; tabla principal sin desplazamiento horizontal, desglose expandible con teclado. Diez tablas de Supabase con las mismas huellas antes/después. [Evidencia](../../../SUPABASE/evidencias/p11_p12_verificacion_2026-10-30.json).

## Guía de revisión

1. Ingresar como admin sin un enlace especial: debe abrir Historial y reportes con hoy.
2. Consultar 17/10/2026: Bs 54, cuatro unidades y cuatro productos. Cappuccino muestra cantidad 1 e ingreso Bs 20.
3. Consultar semana/mes o filtrar QR: tabla y detalle mantienen los resultados P09/P10.
4. Abrir el desglose con clic o Enter; verificar medios de pago y tipos de compra.
5. Pulsar Tomar pedido: abre `/menu`. Volver a Historial desde la navegación.
6. Ingresar como Atención: debe abrir el menú en `/` y rechazar acceso a reportes.
