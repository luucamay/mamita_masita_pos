# Historial de ventas de empleados

## Diagnóstico

El aviso «Revisa el empleado y las fechas (máximo 366 días)» aparecía antes de consultar ventas. La validación HTTP exigía bits de versión y variante RFC en el UUID. Las cuentas antiguas Admin User y Staff User usan identificadores asignados manualmente que PostgreSQL acepta, pero que esa validación rechazaba. Las fechas quedaban vacías porque la consulta inicial fallaba.

## Cambios

| Archivo | Cambio |
| --- | --- |
| `lib/employee-provision.ts` | Acepta la representación canónica hexadecimal del UUID, incluidos los identificadores antiguos. Rechaza formatos inválidos y conserva la autorización administrativa y RLS. |
| `components/employees/employee-sales-panel.tsx` | Actualización por cambios de pedidos/caja, respaldo cada 30 segundos y al recuperar foco o conexión. Botón Actualizar, conservación del período aplicado y reintento sin vaciar resultados. |
| `tests/employees.test.ts` | Regresión para UUID antiguos, actuales y entradas inválidas. |
| `e2e/employee-history.spec.ts` | Lectura real de cuentas antiguas, permisos HTTP, rangos inválidos, actualización y conservación de filtros. |

No necesita migración SQL. No cambia pedidos, pagos, turnos ni identificadores existentes. Las ventas siguen atribuidas a quien registró el pedido de cliente; el cobrador se muestra por separado. Las compras personales conservan sus vistas y reportes propios.

## Verificación manual

1. Entrar como administradora y abrir Empleados → Staff User → Historial de ventas.
2. Comprobar que Desde/Hasta muestran hoy en Bolivia y que aparecen los pedidos del período, sin el error de la fotografía.
3. Elegir Esta semana, Este mes o un rango y pulsar Filtrar. Actualizar debe conservar ese período.
4. Tras un pedido nuevo del empleado, mantener abierto el historial; debe refrescarse con la notificación o el respaldo de 30 segundos. Volver a la pestaña también solicita una lectura.
5. Ante un fallo temporal, los resultados anteriores permanecen visibles y Reintentar consulta el mismo período.

## Pruebas realizadas

| Comprobación | Resultado |
| --- | --- |
| Lógica | 56 pruebas aprobadas. |
| Navegador | 2 pruebas aprobadas: HTTP real para identificadores antiguos, acceso anónimo denegado, rol Cocina denegado, rangos inválidos y actualización con filtros. |
| Entrega | 1 prueba aprobada: rutas QA bloqueadas y conciliación del reporte/Excel. |
| Compilación/tipos | QA, entrega y TypeScript aprobados. |
| Visual | Escritorio 1365×900 y móvil 390×900, sin desbordamiento horizontal. |
| Recursos públicos | Sin secretos ni archivos privados versionados. |

La lectura real de Staff User mostró nueve pedidos de clientes por Bs 361 el 03/11 al verificar. Es una referencia de ese momento, no un valor fijo del sistema. No se crearon pedidos ni se modificaron ventas. Se utilizó una cuenta temporal y se eliminaron su perfil, identidad Auth y archivo privado después; las cuentas QA desactivadas permanecieron desactivadas.

Comando específico: `pnpm test:employees:history`, después de `pnpm build:qa`. Requiere una identidad QA administradora activa; no reactivar cuentas deshabilitadas del negocio para ejecutar pruebas.

La publicación se realiza en la rama de desarrollo. El dominio de producción incorpora el arreglo cuando se integra esa rama.
