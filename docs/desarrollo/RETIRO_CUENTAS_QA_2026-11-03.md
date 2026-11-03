# Retiro de accesos QA

El 03/11/2026 Omar autorizó retirar las cuentas de prueba al terminar la implementación.

| Elemento | Resultado |
| --- | --- |
| Supabase Auth | Seis identidades QA eliminadas mediante la API administrativa. |
| Sesiones | Revocadas antes de eliminar las identidades; verificación final: cero sesiones QA. |
| Perfiles | Seis perfiles inactivos conservados por sus referencias de auditoría. No permiten acceso. |
| Auditoría | Eventos, altas y solicitudes de contraseña conservados sin cambios. |
| Negocio | Seis identidades reales conservadas, con sus perfiles y permisos intactos. |
| Credenciales locales | Retirado `.env.test.local`; no se guardó una copia de las contraseñas. |
| Empleados | `listEmployees()` excluye perfiles cuya identidad Auth ya no existe. Conserva visibles los empleados desactivados que aún tienen identidad. |

La selección se realizó mediante seis identificadores explícitos, comprobando sus correos de prueba y la ausencia de pedidos, pagos, movimientos y turnos asociados. No se ejecutó un borrado por nombres ni un reinicio de datos. Se comprobó también la ausencia de objetos Storage de las cuentas QA y la permanencia de un administrador real activo.

Los perfiles se conservan porque las referencias de auditoría impiden eliminarlos sin perder trazabilidad. Solo se eliminaron sus accesos Auth y sesiones; no se borraron eventos de empleados.

## Verificación

- Cero usuarios Auth del dominio QA y cero perfiles QA activos.
- Directorio de accesos: seis cuentas reales.
- Huellas de los perfiles reales, catálogo, categorías, turnos, promociones y auditoría idénticas antes y después.
- Durante la revisión se registró actividad real concurrente: un pedido nuevo de Staff 2 por Bs 35, con sus tres líneas y cobro. Por eso las huellas de ventas cambian entre capturas; no se afirma una huella global idéntica. No se modificaron ni eliminaron ventas en esta operación.
- Compilación de entrega y 56 pruebas de lógica aprobadas. Las pruebas E2E autenticadas requieren nuevas identidades de prueba autorizadas; las antiguas ya no existen.

El inventario previo, SQL con comprobaciones, resultado de Auth y verificación están fuera de Git en `SUPABASE/RESPALDOS_PRIVADOS/2026-11-03_retiro_cuentas_qa/`. El inventario no contiene contraseñas ni tokens y no constituye un respaldo recuperable de Auth.

La eliminación de accesos está aplicada en Supabase. El ajuste visual del directorio se publica por la rama de desarrollo y requiere integración en producción.
