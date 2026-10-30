# P08 — Perfil del empleado

| Dato | Entrega del 29/10/2026, Bolivia |
| --- | --- |
| Estado | Implementado después de probar P07; revisión de Omar pendiente. Sin despliegue web. |
| Ruta | `/perfil`, accesible a los cuatro roles activos. |
| Base de datos | Sin migración adicional: utiliza el perfil existente y Supabase Auth. |
| Alcance | Datos propios de solo lectura, descuento e historial personal integrado. |

## Resultado

La opción **Perfil** de la navegación muestra avatar de iniciales, nombre, correo de la identidad validada en Auth, rol y estado Activa. El perfil activo se consulta desde servidor; no se utiliza metadata editable del usuario para autorizar roles. No se solicita ni acepta un ID ajeno para elegir qué cuenta mostrar.

La sección **Tu compra personal** explica el 20 % fijo sin acumulación y abre P07 mediante **Comprar con descuento de empleado**. La compra permite regresar a Mi perfil. Debajo aparece el historial personal con subtotal, descuento, neto, estado y medio de pago cuando corresponde. Atención/Administración tiene además acceso a Cobros de empleados.

Se conservan los destinos habituales de inicio: Cocina para cook, Café para barista y Menú para staff/admin. Un acceso válido a Perfil no redirige a esas colas. Las cuentas inactivas o sin sesión no reciben los datos del perfil. Los estados de carga explican la espera al consultar Supabase.

El alcance es de lectura: no se añadieron cambios de nombre, contraseña, rol, correo, estado ni subida de fotografías. Las iniciales evitan requerir Storage y una nueva política de archivos.

## Archivos

| Ubicación | Contenido |
| --- | --- |
| `app/perfil/page.tsx` | Lectura autorizada de identidad, perfil e historial. |
| `components/profile/profile-panel.tsx` | Datos propios, beneficio del 20 %, navegación e historial P07. |
| `app/perfil/loading.tsx` | Estado de carga sin datos personales. |
| `components/app-shell.tsx` | Entrada Perfil para los cuatro roles; navegación móvil y escritorio. |
| `lib/auth.ts`, `lib/permissions.ts` | Identidad verificada, perfil activo y matriz de rutas. |
| `e2e/profile.spec.ts` | Acceso propio de los cuatro roles, integración de compra y bloqueo de sesiones inválidas. |

## Verificación

Los cinco escenarios P08 aprobados comprueban admin/staff/cook/barista y el rechazo sin sesión o con perfil inactivo. Se comprueba que una query `user_id` ajena no cambia los datos mostrados, que no aparecen los correos de los otros roles y que el recorrido Perfil → Compra → Perfil funciona. Login y lecturas usan las cuentas QA reales; no se registran compras con estas pruebas. La ejecución final conjunta aprobó **33 de 33 escenarios**, cero omitidos, sin reintentos automáticos; build QA/TypeScript y 22 pruebas de lógica también aprobados.

Se revisaron capturas de escritorio y móvil (390 px), sin desbordamiento horizontal. La regresión conjunta incluye P01–P08. Una aserción inicial de navegación de Atención agotó los 5 segundos por espera de red; se verificó el mismo recorrido con 15 segundos y se añadieron estados de carga. Esto no cierra la revisión de rendimiento general P14.

## Guía de revisión

1. Ingresar con una cuenta QA activa y abrir **Perfil**; en móvil, abrir antes el menú superior.
2. Comprobar nombre, iniciales, correo y rol propios. No deben existir controles para modificar permisos.
3. Pulsar **Comprar con descuento de empleado**; comprobar el 20 % y el nombre del comprador.
4. Pulsar **Volver a mi perfil** y comprobar el historial. Si otra sesión acaba de cobrar una compra, usar **Actualizar compras**.
5. Repetir con otro rol: debe aparecer la identidad de esa sesión. Cocina/Barista mantiene su acceso de trabajo y no ve el panel de cobros del equipo.
6. Cerrar sesión y abrir `/perfil`: debe solicitar ingreso.

Para el ciclo de cobro, integración en reportes y límites de las pruebas, consultar [P07](P07_COMPRAS_EMPLEADOS.md).
