# Caja y cambios de turno por horario

Fecha: 03/11/2026. Rama: `desarrollo/mejoras-octubre-2026`. Zona horaria: `America/La_Paz`.

| Función | Comportamiento |
| --- | --- |
| Mañana | 10:00–14:00. |
| Tarde | 14:00–21:30. |
| Apertura/recepción | Manual, con efectivo contado y confirmación. El servidor asigna el horario vigente. Disponible dentro del horario de atención. |
| Registro de pedidos | Los pedidos de clientes, de mesa o para llevar, requieren una caja abierta y vigente. Se puede consultar el menú antes. |
| Cobros/devoluciones | Requieren una caja vigente; incluye compras de empleados y ajustes. |
| Dos cuentas | Pueden tomar pedidos y cobrar simultáneamente en la misma caja; cada recibo conserva quién cobró. Hay un responsable del turno. |
| Recordatorio | Desde 13:55 o 21:25, con la app abierta. Permite posponer cinco minutos o ir al cierre. |
| Fin del horario | Bloquea nuevos pedidos/cobros en la caja vencida. Se debe contar, cerrar y entregar manualmente. Posponer el aviso no prolonga el turno. |
| Historial | Identifica mañana/tarde y su horario; conserva apertura, responsable, cierre y recepción reales. |

## Qué ocurría

La caja compartida de Staff 2 seguía abierta con Bs 184 de inicial. Una segunda cuenta podía cobrar en ella sin abrir otra. Entrar al menú o seleccionar productos no creaba una apertura. El nuevo aviso identifica el turno y su responsable para hacer visible esa situación.

Registrar por la tarde ventas de la mañana usa la hora real de registro/cobro y la caja abierta en ese momento. No se backdatean operaciones ni se trasladan recibos a cierres ya realizados. Los pedidos de mesa conservan el cobro al terminar el consumo; el dinero se atribuye al turno en que realmente se confirma el cobro.

Las compras personales pueden enviarse pendientes desde Perfil; Atención/Administración necesita una caja vigente para confirmar su pago.

## Implementación

- Migración aplicada: `20261103212027_scheduled_cash_shifts.sql`. Añade a `cash_shifts` el identificador mañana/tarde y comienzo/fin previstos. Los registros anteriores admiten campos nulos, sin reescribir sus importes.
- `private.cash_schedule()` calcula el horario de Bolivia. La apertura pública conserva su contrato y registra el horario usando el reloj del servidor, sin aceptar fechas elegidas por el cliente.
- Un trigger anterior al INSERT de pedidos de clientes exige caja vigente. La captura de recibos aplica el mismo control y el bloqueo transaccional existente de apertura/cierre. No se desactivan triggers, RLS ni permisos.
- `cashbox_context()` devuelve el horario vigente y su hora de servidor. El cliente usa esa referencia y tiempo transcurrido para el aviso; cambiar el reloj del teléfono no autoriza operaciones fuera del turno.
- `CashboxProvider` comparte la lectura de caja entre el aviso y el menú. El pedido conserva sus productos mientras llega una apertura hecha desde otra cuenta. La confirmación queda deshabilitada mientras falta una caja válida.
- Navegación: **Caja y turnos**. Estado vencido: **Pendiente de cierre**; el botón de cierre permanece disponible después del horario.

Los recordatorios se muestran dentro de la aplicación. No se agregó un servicio de notificaciones push con la app cerrada, ni un cron que abra o cierre cajas automáticamente.

## Reinicio autorizado de pruebas

Tras la limpieza anterior se registraron cinco pedidos nuevos: `20261103-010` a `20261103-014`, cobrados por Bs 164. Omar solicitó retirarlos y eliminar también las aperturas/cierres de prueba.

Se respaldaron y retiraron esos cinco pedidos, sus cinco pagos/movimientos, asociaciones de caja, solicitudes y eventos relacionados, junto con los dos turnos de prueba. La verificación posterior arrojó cero pedidos/cobros de hoy, cero turnos y cero asociaciones de recibos. Se conservaron 938 pedidos y 938 pagos históricos; las huellas de los demás datos coinciden.

La apertura continúa siendo obligatoria tras el reinicio. No se reinició la numeración ni se modificaron cuentas, catálogo o promociones. El respaldo y SQL exacto están fuera del repositorio, en `SUPABASE/RESPALDOS_PRIVADOS/2026-11-03_horarios_y_reinicio/`.

La cuenta QA administradora anterior estaba desactivada por el negocio. Para comprobar la interfaz se creó una identidad temporal, se verificaron únicamente escrituras simuladas y después se eliminaron su perfil, identidad Auth y archivo local de credenciales. No se reactivó la cuenta anterior ni se cambiaron contraseñas de usuarios existentes.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| PostgreSQL temporal | 87 grupos aprobados: módulos anteriores, límites exactos de horario, caja obligatoria, dos cuentas simultáneas, devolución/cobro rechazados al vencer y cierre manual posterior. |
| Lógica | 55 pruebas aprobadas, incluidos aviso, aplazamiento y cambio de turno a las 14:00. |
| Navegador QA | 9 pruebas aprobadas: apertura requerida, aviso/posponer, turno vencido, reloj del dispositivo alterado y regresión de observaciones. |
| Entrega | 1 prueba aprobada: ocho rutas QA bloqueadas y Excel real de octubre conciliado. |
| Compilación y tipos | QA y entrega aprobadas; TypeScript verificado. |
| Visual | Móvil 390×844 y escritorio 1365×900, sin desbordamiento horizontal; confirmación deshabilitada y acceso a Caja visibles. |
| Secretos/advisors | Sin secretos en recursos públicos ni avisos de seguridad nuevos. |

Comandos: `pnpm test:schedule:db`, `pnpm build:qa`, `pnpm test:schedule:ui`, `pnpm build:release`. Las cuentas QA desactivadas no se reactivan para ejecutar tests; hacen falta credenciales autorizadas de una identidad de pruebas activa. Las ventas del navegador se interceptan y el runner SQL utiliza un PostgreSQL temporal local.

## Revisión con el equipo

1. Abrir Caja y turnos: debe aparecer Sin turno abierto tras el reinicio. Contar el efectivo real y confirmar Abrir caja.
2. Entrar desde otro teléfono con otra cuenta de Atención: ambos deben ver el mismo responsable y turno. No hace falta abrir una segunda caja.
3. Registrar pedidos y cobros del momento; comprobar quién cobró en los movimientos.
4. Cinco minutos antes del límite, revisar el recordatorio. Posponerlo afecta solo al aviso.
5. Al terminar, contar todo el efectivo, registrar el retiro si lo hay y confirmar el cierre. Quien entra cuenta lo recibido y confirma la recepción.
6. Revisar los cierres desde Administración. El efectivo inicial no se suma de nuevo como venta.

La vista previa corresponde a la rama de desarrollo. Para mostrar las nuevas pantallas y avisos en el dominio habitual hay que integrar esa rama en la de producción; la migración y el reinicio de datos ya están aplicados.
