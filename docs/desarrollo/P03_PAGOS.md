# P03 — Identificación de pagos

| Elemento | Resultado |
| --- | --- |
| Implementación | Insignias con SVG y texto en tarjeta y detalle |
| Métodos | Efectivo, QR y Tarjeta; medio desconocido y sin cobrar diferenciados |
| Archivos | `lib/payment.ts`, `components/orders/payment-badge.tsx`, `components/orders/orders-list.tsx` |
| Base | Reutiliza estado, paid_at y payment_method; sin migración nueva |
| Pruebas | Clasificación, TypeScript/build y navegador aprobados el 29/10/2026 |

Una orden abierta no se presenta como cobrada aunque tenga un método residual. Una orden cerrada sin fecha de pago se identifica como pago sin confirmar; no se inventa efectivo ni QR. Tras cobrar se cierra el detalle y la lista actualizada obtiene los datos reales del servidor.

Revisión: entrar como atención o admin, abrir Pedidos → Cerrados y comparar las insignias Efectivo/QR con el detalle. En Activos aparece Sin cobrar. El texto acompaña al color y al icono. Se comprobó viewport móvil sin desbordamiento.

Comandos: `node --experimental-strip-types --test tests/payment.test.ts`, `pnpm build:qa`, `pnpm exec playwright test --config playwright.modules.config.ts --grep P03`. La prueba de navegador solo lee pedidos existentes; no genera pagos. Sin despliegue.
