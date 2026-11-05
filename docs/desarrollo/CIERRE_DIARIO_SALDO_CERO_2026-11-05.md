# Caja independiente por día

Regla vigente confirmada por Omar el 05/11/2026: **cada jornada empieza obligatoriamente con saldo inicial Bs 0; el cierre del último turno termina el flujo de caja de ese día.** Sustituye la regla anterior de recibir al día siguiente el efectivo dejado la noche anterior.

| Momento | Comportamiento |
| --- | --- |
| Primera apertura del día | Saldo Bs 0 obligatorio en interfaz y servidor. No acepta inicial positivo ni vincula el turno al cierre de ayer. |
| Mañana → tarde | Se conserva la recepción y conteo del efectivo entre turnos del mismo día. |
| Cierre de tarde | Archiva definitivamente la jornada; el importe final se conserva como histórico, aunque no se haya registrado un retiro físico. |
| Día ya cerrado | No permite abrir otro turno en esa jornada. |
| Día siguiente | Se abre una caja nueva con saldo Bs 0. No recibe el cierre anterior. |
| Turno olvidado abierto | Debe cerrarse manualmente; no se inventa un conteo ni se cierra por cron. La nueva jornada se abre en cero después. |

## Implementación

- Migración local `20261105185839_zero_daily_cash_balance.sql`, aplicada en Supabase como `20261105190941_zero_daily_cash_balance`.
- `cash_shifts.is_day_closed` distingue un cierre archivado del fin de un turno pendiente de recepción en el mismo día. Los importes e instantáneas históricos no se recalculan.
- El índice único conserva una sola caja abierta/pendiente operativa y excluye jornadas archivadas.
- `open_cashbox_shift` exige cero fuera de una recepción de hoy, prohíbe reabrir un día cerrado y no enlaza jornadas distintas. Conserva permisos, bloqueo transaccional e idempotencia.
- `close_cashbox_shift` marca el cierre final de tarde como fin de jornada. El mismo criterio se aplica al cerrar un turno olvidado de un día anterior. El conteo y la diferencia quedan registrados por el procedimiento habitual.
- `get_cashbox_context` excluye cierres archivados/pendientes anteriores del saldo operativo y comunica el estado Día cerrado.
- Apertura: campo de inicial fijo en cero y confirmación expresa. Cierre: aviso de fin de día. Historial: Saldo final archivado, sin traspaso al día siguiente.

No se crea un retiro, entrega a la dueña ni devolución ficticia. El cierre conserva el importe contado; simplemente no se reutiliza como inicial de otro día. La hora y la fecha provienen del servidor y se interpretan en Bolivia.

## Adecuación del 05/11

La apertura de la mañana tenía inicial Bs 460 vinculado al cierre del 04/11. Se corrigió el turno abierto a inicial Bs 0 y sin predecesor de ayer, conservando sus cobros. Se dejó una observación de mantenimiento con la regla, importe original y motivo; referencia `MM-CERO-DIARIO-20261105`.

Al verificar: efectivo de hoy Bs 18, QR Bs 0 y saldo esperado Bs 18. Las huellas de pedidos, pagos y movimientos coinciden antes/después. Todos los importes e instantáneas de los cierres anteriores coinciden; únicamente se añade su marca de jornada archivada.

Respaldo parcial y SQL exacto, fuera de Git: `SUPABASE/RESPALDOS_PRIVADOS/2026-11-05_cero_diario/`.

## Verificación

- 98 comprobaciones PostgreSQL aprobadas en un clúster nuevo local: directorio, IP y puerto verificados antes de cualquier mutación. El primer intento fue bloqueado por revisión automática por no demostrar el aislamiento; el runner ahora comprueba `data_directory`, localhost y puerto contra su clúster temporal. Nunca carga credenciales de producción.
- 59 pruebas de lógica aprobadas; compilación de entrega y TypeScript correctos.
- Dos pruebas de navegador sobre la entrega: apertura fija en cero sin turno previo, cierre de tarde, día cerrado sin botón para recibir/reabrir y escrituras financieras simuladas.
- Inspección visual en 390×900 y 1365×900, sin desbordamiento horizontal.
- Lectura real autenticada confirma inicial cero y cobros de hoy conservados. La identidad temporal de pruebas se retira al terminar; no se reactivan las cuentas QA eliminadas.

Advisors no detecta avisos nuevos. Se mantiene la configuración previa de [protección de contraseñas filtradas deshabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) y las tablas internas cerradas con RLS sin políticas; no se modificaron permisos para ocultar esos avisos.

Para verificar con el negocio: actualizar Caja y turnos, revisar inicial cero del primer turno, recibir solo el cierre de mañana al abrir tarde, cerrar la tarde y comprobar Día cerrado. Al día siguiente debe aparecer Abrir caja, con inicial cero bloqueado para edición.

La regla y la adecuación del saldo están aplicadas en Supabase. Los nuevos textos y estados de interfaz se publican desde desarrollo e ingresan al dominio habitual al integrar esa rama en producción.
