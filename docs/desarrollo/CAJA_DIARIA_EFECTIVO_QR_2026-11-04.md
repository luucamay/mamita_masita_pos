# Caja diaria: efectivo, QR y saldo inicial

## Diagnóstico

El 04/11 se abrió un turno con Bs 1.004,60 recibidos del cierre anterior. Ese importe estaba registrado como `opening_cash`, separado de sus cobros; no era una venta nueva. La presentación destacaba el efectivo esperado junto a las ventas y no ofrecía la suma de ambos turnos del día, lo que confundía a la dueña.

QR ya se guardaba en los cierres y se mostraba en su historial. Se refuerza su presentación en el formulario de cierre, el cierre pendiente de recepción y la tarjeta histórica, junto con el total vendido.

## Cambios

| Lugar | Comportamiento |
| --- | --- |
| Caja y turnos → Ventas del día | Tabla Mañana/Tarde/Total día con Efectivo, QR y Total. Inicia en hoy de Bolivia y permite otra fecha. |
| Nuevo día | Usa únicamente cobros de esa fecha; no arrastra ventas, efectivo inicial ni QR del día anterior. Si la pantalla queda abierta, Hoy sigue la fecha del servidor. |
| Turno abierto | Efectivo, QR y Total vendido; debajo se distinguen efectivo inicial y efectivo esperado físico. |
| Cierre | Efectivo vendido, QR y Total del turno visibles antes de confirmar. El conteo sigue siendo del efectivo físico, incluido el inicial. |
| Cierre pendiente/histórico | Muestra Efectivo, QR y Total, con el dinero dejado en caja por separado. |

La apertura/recepción y el cierre continúan siendo manuales. No se pone a cero el dinero físico ni se cambian cierres previos. Si se dejan Bs 100 y no hay ventas nuevas, las ventas son Bs 0 y el efectivo esperado sigue siendo Bs 100.

## Base de datos

Migración local: `20261104175434_cash_daily_summary.sql`. Aplicada en Supabase como `20261104180438_cash_daily_summary`.

Añade una consulta de solo lectura `get_cashbox_daily_summary(date)`, para Atención/Administración activas. La implementación interna valida el rol y usa `search_path` vacío; la función pública es `security invoker`, sin acceso anónimo. No modifica funciones de cobro, apertura o cierre ni escribe en tablas financieras.

Agrupa recibos canónicos del turno abierto y las instantáneas de turnos cerrados, por fecha real del cobro en Bolivia. Conserva devoluciones negativas y compras de empleados; evita duplicar pago inicial/movimiento inicial. Usa el turno asignado al abrir. No reinterpreta como Mañana operaciones registradas previamente por la tarde.

Este resumen corresponde a movimientos asociados a turnos de caja. Las ventas históricas anteriores a la activación de ese control se siguen consultando en Historial y reportes; no se les asignan turnos retroactivamente.

## Pruebas

- 92 comprobaciones PostgreSQL en un clúster temporal local: permisos, medianoche de Bolivia, conservación de cierres, devoluciones y regresión de módulos anteriores.
- 58 pruebas de lógica; compilaciones QA/entrega y TypeScript aprobados.
- Chrome: vista móvil 390×900 y escritorio 1365×900, formulario de cierre, filtros, reintento y cambio de día. Dos casos funcionales de navegador aprobados sobre la compilación de entrega.
- Ejemplo de la hoja: mañana 236 + 573 = 809; tarde 664 + 270 = 934; efectivo 900, QR 843, total diario 1.743. Efectivo inicial excluido.
- Consulta real del 04/11: efectivo 32, QR 146, total 178 al verificar, separado de Bs 1.004,60 de inicial. El 05/11, sin movimientos, devuelve cero. Son lecturas, no ventas generadas para pruebas.
- Recursos públicos sin secretos. Advisors mantiene los avisos previos: tablas internas cerradas con RLS y [protección de contraseñas filtradas deshabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no hay avisos nuevos por esta migración.

Se utilizó una identidad temporal para el navegador y se retiró al terminar, sin reactivar las seis cuentas QA eliminadas. Las escrituras financieras del navegador se bloquearon o simularon; no se registraron pedidos/cierres reales para verificar.

Comandos: `pnpm test:cashdaily:db`, `pnpm build:release`, `pnpm test:cashdaily:ui`. La prueba de navegador requiere una identidad temporal autorizada en `.env.cash-daily-test.local`; ese archivo no se publica ni versiona.

## Verificar con la dueña

1. Entrar en Caja y turnos: Ventas del día debe mostrar hoy, Efectivo, QR y Total, con Mañana/Tarde separados.
2. Al abrir/recibir sin cobros nuevos, las ventas del turno deben mostrar cero; el dinero recibido figura como inicial.
3. Cobrar una venta real por Efectivo y otra por QR: revisar su columna y el total del turno/día.
4. Abrir Cerrar y entregar caja: revisar Efectivo vendido, QR, Total e inicial/esperado antes de contar y confirmar.
5. Consultar el día anterior en el selector: sus ventas deben aparecer solo al elegir esa fecha.

La consulta de Supabase está aplicada. Las nuevas pantallas se publican en desarrollo y requieren integrar esa rama en producción.
