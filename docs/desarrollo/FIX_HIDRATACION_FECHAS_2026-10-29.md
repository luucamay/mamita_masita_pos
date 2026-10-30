# Corrección de hidratación de fechas — 29/10/2026

| Elemento | Resultado |
| --- | --- |
| Incidencia | Pedidos: servidor `p.\u00a0m.` y navegador `p. m.` |
| Causa | Formato de día/período dependiente de ICU, sin zona horaria explícita |
| Corrección | `lib/date-time.ts`: partes numéricas, zona `America/La_Paz`, texto y espacios fijos |
| Vistas | Pedidos activos/cerrados y recibo; horas de Café y Cocina |
| Validación | 3 pruebas de fechas, build QA y 2 escenarios de navegador aprobados |

Se conserva el formato de doce horas: `13/10, 07:07 p. m.`. La fecha/hora visible utiliza Bolivia independientemente de la configuración del servidor o dispositivo. El helper obtiene día, mes, hora y minuto con `Intl.DateTimeFormat.formatToParts`, con calendario gregoriano, cifras latinas y ciclo h23; después compone la cadena con signos y espacios ordinarios explícitos. Las fechas inválidas muestran un guion largo.

No se añadió `suppressHydrationWarning` ni se difirió el renderizado hasta después de montar: servidor y cliente generan el mismo contenido desde la primera carga. No hubo cambios de esquema ni ventas de prueba.

La comprobación de navegador usa servidor UTC y clientes en `America/La_Paz` y `Asia/Tokyo`. Recarga documentos completos de Pedidos activos/cerrados, compara la primera fecha HTML con el texto hidratado, abre el detalle para comprobar eventos, visita Café/Cocina y comprueba ausencia de avisos de hidratación. Es una prueba de lectura con cuentas QA. Las colas pueden estar vacías: su helper compartido queda cubierto por las pruebas de hora, incluyendo medianoche y mediodía.

Comandos: `node --experimental-strip-types --test tests/date-time.test.ts`, `pnpm build:qa`, `pnpm exec playwright test --config playwright.hydration.config.ts`. Para repetir manualmente: recargar `/pedidos` con Ctrl+Shift+R, revisar Activos/Cerrados y pasar por Café/Cocina; ya no debe aparecer el error.

Referencias: [React: contenido idéntico al hidratar](https://react.dev/reference/react-dom/client/hydrateRoot#caveats), [MDN: formatToParts](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts).
