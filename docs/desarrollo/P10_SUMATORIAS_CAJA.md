# P10 — Total del día, Efectivo y QR

| Dato | Entrega del 30/10/2026, Bolivia |
| --- | --- |
| Pantalla | Historial y reportes, disponible solo para Administración. |
| Vista inicial | Solo hoy: Total del día, Efectivo y QR antes de los filtros. |
| Cambio en base | Ninguno adicional: reutiliza la consulta única de P09 ya aplicada. |
| Estado | Implementado después de probar P09; revisión de Omar pendiente. Sin despliegue Vercel. |

## Reglas confirmadas

Omar eligió conservar el resumen del período y tipo de compra solicitados, mientras Efectivo/QR filtra solo el detalle. Recalcó que lo primordial es ver el total del día, sin sumar todo el historial. Por eso `/historial` abre con hoy en Bolivia; semana, mes y otra fecha requieren selección expresa.

Los tres cuadros muestran **ingresos netos cobrados**, con descuentos aplicados. El total incluye clientes y empleados salvo que se elija un tipo de compra específico. Se presentan también cantidad de pedidos y unidades; un pedido con varios productos sigue contando una sola vez. Las compras pendientes/canceladas y las líneas anuladas no suman ingresos.

Si hay tarjeta, aparece **Otros (tarjeta)** con importe y pedidos, incluido en el total. Así no se afirma que Efectivo + QR equivale a todo el ingreso cuando existe otro medio. La base actual no tiene pagos con tarjeta; este caso se verificó con datos sintéticos.

El rango y la regla de fecha de cobro se muestran junto al resumen. Al cambiar Semanal/Mensual, el título cambia a Total de la semana/Total del mes. Al filtrar QR, el detalle y CSV cambian, mientras los cuadros conservan la caja completa del período/tipo de compra elegido; la pantalla lo explica junto a las cifras.

## Implementación

| Archivo | Responsabilidad |
| --- | --- |
| `components/reports/report-summary.tsx` | Cuadros Total/Efectivo/QR, pedidos/unidades y aviso de Otros cuando existe. |
| `components/reports/report-view.tsx` | Coloca fecha y resumen antes de los filtros y detalle, con adaptación móvil. |
| `lib/report-contract.ts` | Contrato común de resumen y detalle obtenido en P09. |
| `scripts/test-reporting-checks.mjs` | Casos de caja independientes, descuentos, empleados y otros medios. |
| `e2e/reports.spec.ts` | Cifras reales, filtros, vista inicial de hoy, ceros y presentación móvil/escritorio. |

No se calcula el total sumando las filas de la tabla en el navegador: proviene de los pagos agregados en PostgreSQL. Los tres cuadros comparten el mismo snapshot con el detalle. Un error de consulta oculta las cifras y muestra un mensaje; no inventa Bs 0 de caja.

En móvil el total ocupa la primera fila; Efectivo y QR comparten la siguiente. No cambia el inicio de la app al dashboard: eso corresponde a P11. Tampoco se implementa Excel en esta entrega: corresponde a P12.

## Pruebas y guía

**Cierre técnico:** build QA/TypeScript aprobado, 25 pruebas de lógica, 40 grupos SQL acumulados y **37/37 escenarios de regresión de navegador**, cero omitidos o reintentos automáticos. P09 se verificó antes de iniciar P10. Se revisó el resultado a 1280 px y 390 px, sin desbordamiento de página. Los reportes de navegador usan lecturas reales del Supabase compartido; los casos sintéticos de cobro/empleado/tarjeta se ejecutan solo en PostgreSQL temporal. No se guardaron ventas de prueba. [Evidencia agregada](../../../SUPABASE/evidencias/p09_p10_verificacion_2026-10-30.json).

Los casos de PostgreSQL comprueban efectivo Bs 59 + QR Bs 34 = **Bs 93**, dos pedidos y cuatro unidades. Al añadir compra de empleado Bs 47,20 en efectivo y tarjeta Bs 10, el total es Bs 150,20, efectivo Bs 106,20, QR Bs 34 y Otros Bs 10. El filtro QR deja Bs 34 en el detalle y conserva la caja completa. No se guardan estos fixtures en Supabase.

Para verificar con los datos existentes:

1. Ingresar como admin y abrir **Historial**. Verificar fecha actual y Total del día; si no hubo cobros hoy, las tres cifras deben ser cero.
2. Elegir **17/10/2026** y aplicar: Total Bs 54, Efectivo Bs 54, QR Bs 0; 1 pedido y 4 unidades.
3. Pulsar **Semanal**: 12–18/10, Total Bs 689, Efectivo Bs 309 y QR Bs 380; 11 pedidos y 40 unidades.
4. Elegir QR y aplicar: el detalle muestra Bs 380, mientras el resumen conserva Bs 689 / Bs 309 / Bs 380.
5. Elegir **Mensual**: octubre muestra Total Bs 6.832, Efectivo Bs 3.471,50 y QR Bs 3.360,50. El filtro QR sigue aplicado al detalle.
6. Elegir Empleados: al entregar no hay compras personales persistentes; los cuadros deben mostrar cero para ese tipo. Volver a Todas y Hoy para revisar la caja actual.

Estas verificaciones de reportes son de lectura. Los cobros manuales que se hagan desde otros módulos sí afectan la base compartida y sus reportes.
