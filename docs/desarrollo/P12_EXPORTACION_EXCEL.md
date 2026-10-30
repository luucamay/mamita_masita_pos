# P12 — Excel con formato

| Dato | Entrega del 30/10/2026, Bolivia |
| --- | --- |
| Acción | Exportar Excel en Historial y reportes. Reemplaza CSV. |
| Archivo | `.xlsx` real, una hoja Ventas con tablas y formatos. |
| Formato | Naranja y crema de Mamita Masita, confirmado por Omar. |
| Datos | Misma consulta y filtros de P09/P11: período, fecha, pago y tipo de compra. |
| Base | Sin migración adicional ni escrituras de negocio. |
| Estado | Implementado después de probar P11; revisión de Omar pendiente. Sin despliegue. |

## Contenido

Cabecera Mamita Masita, período diario/semanal/mensual, fechas Desde/Hasta, Bolivia, filtros de pago y compra, ingreso exportado, cantidad de pedidos y unidades. La tabla principal contiene **Ítem, Cantidad e Ingreso total**, agrupada con la misma utilidad del dashboard P11.

El total corresponde al **detalle filtrado**, no al total general de caja cuando se ha elegido QR/Efectivo. Por ejemplo, la semana 12–18/10 tiene caja Bs 689 y detalle QR Bs 380: el Excel QR exporta Bs 380. Un desglose en la misma hoja conserva medio de pago y etiqueta Compra de empleado. No se incluyen correos, clientes ni credenciales.

Cantidades e ingresos son números, con formatos de entero y moneda de dos decimales. Desde/Hasta son fechas de Excel. Hay cabeceras coloreadas, filas alternas, tablas nativas con filtros, encabezado inmovilizado y total con SUM y valor calculado guardado. Al abrir en Excel, el libro solicita recálculo; no depende de que el visor calcule para mostrar el total inicial.

Los nombres de producto se escriben explícitamente como texto. Un nombre que comience con `=`, `+`, `-` o `@` no se convierte en fórmula. El generador comprueba que las unidades e ingresos por producto concilien con el total filtrado antes de producir un archivo. Un período vacío muestra cero y Sin ventas cobradas, sin inventar filas de ventas.

## Implementación

| Archivo | Responsabilidad |
| --- | --- |
| `lib/report-xlsx.ts` | Generación de XLSX, formatos, tablas, fórmulas y conciliación. |
| `app/historial/export/route.ts` | Endpoint admin, validación de filtros, MIME XLSX, nombre de archivo y errores. |
| `components/reports/report-view.tsx` | Acción Exportar Excel con la misma fecha y filtros mostrados. |
| `lib/report-products.ts` | Agregación compartida con el dashboard, en centavos enteros. |
| `package.json`, `pnpm-lock.yaml` | ExcelJS fijado en 4.4.0, utilizado solo por el servidor Node. |
| `tests/report-xlsx.test.ts` | Archivo real, tipos, fórmulas, texto literal, empleado, ceros y 1.005 productos. |
| `e2e/excel-export.spec.ts`, `e2e/reports.spec.ts` | Descarga, filtros, períodos y datos reales con cuentas QA. |

Se retiraron `lib/report-csv.ts` y su test exclusivo. Las pruebas de identificación de empleado e inclusión de ingresos están cubiertas en el nuevo XLSX. La documentación P07–P10 que menciona CSV describe el estado histórico de aquellas entregas; la acción actual es Excel.

El endpoint mantiene autorización por usuario validado y perfil admin activo; no usa la clave administrativa. No admite fechas inválidas ni parámetros duplicados. Las respuestas de archivo son privadas, no se guardan en caché y llevan `nosniff`. Los fallos de generación devuelven error, no un CSV renombrado ni un archivo vacío.

## Verificaciones

**Cierre técnico:** build QA/TypeScript aprobado; 32 pruebas de lógica acumuladas y regresión de 42/42 escenarios de navegador. Después del ajuste final de formato se repitieron los nueve escenarios afectados de dashboard/filtros/Excel: 9/9, sin omitidos ni reintentos automáticos. P11 fue probado antes de iniciar P12.

La muestra descargada desde la app se abrió con ExcelJS y, de forma independiente, con openpyxl para comprobar fechas, valores numéricos, fórmula SUM, resultados guardados y dos tablas nativas con filas TOTAL reales. Se importó, recalculó y renderizó con el motor Artifact Tool: cero errores de fórmula y revisión de cabecera/tabla/desglose. Los sangrados de ciertas celdas no se reflejan completamente en ese renderizador; se comprobaron en los metadatos XLSX. No se controló una instalación de Microsoft Excel ni teléfonos Android/iOS físicos: la descarga móvil se probó con Chrome a 390 px. La muestra queda disponible para revisión en el lector de Omar.

Se conservan las diez huellas de datos públicos de Supabase, con 939 pedidos y 938 pagos antes/después; no hubo migraciones ni ventas nuevas. No se publicaron cambios. [Evidencia](../../../SUPABASE/evidencias/p11_p12_verificacion_2026-10-30.json).

Las cinco pruebas específicas crean y vuelven a abrir XLSX: números y fechas tipados, estilos/tablas, total SUM y valor guardado, nombre con fórmula aparente conservado como texto, acentos, compras de empleados, cero ventas y 1.005 productos. El caso de discrepancia rechaza generar un archivo con total distinto al detalle. P11 ya tenía tres pruebas de lógica y siete escenarios de navegador aprobados antes de iniciar P12.

Se descarga una muestra real del 17/10/2026: **Bs 54, cuatro unidades y un pedido**. Se comprueba desde escritorio y móvil. El filtro QR semanal exporta **Bs 380**, sin efectivo. Empleados en ese día exporta cero porque no hay compras de empleado persistentes al entregar. La regresión final, inspección independiente y evidencia se registran al cerrar la verificación.

La biblioteca elegida y sus capacidades se consultaron en el [repositorio oficial ExcelJS](https://github.com/exceljs/exceljs) y [release 4.4.0](https://github.com/exceljs/exceljs/releases/tag/v4.4.0). La generación debe ejecutarse dentro de la app desplegable; la herramienta de hojas de cálculo del workspace se utiliza para inspección y renderizado de la muestra, sin añadirla como dependencia del proyecto.

## Guía para Omar

1. Ingresar como administrador: abre el dashboard de hoy.
2. Elegir 17/10/2026 y aplicar filtros. Pulsar Exportar Excel.
3. Abrir el `.xlsx`: comprobar cabecera, fechas, colores, tabla Ítem/Cantidad/Ingreso total y total Bs 54; cantidades 4 y pedidos 1.
4. Revisar debajo el desglose por pago y tipo de compra. Las compras de empleado futuras aparecerán identificadas allí.
5. Elegir Semanal y QR: la descarga debe indicar QR, rango 12–18/10 y total Bs 380.
6. Repetir la descarga desde el móvil; verificar el nombre `.xlsx` y su apertura en un lector compatible.
7. Atención/Cocina/Barista no debe poder descargar reportes administrativos.
