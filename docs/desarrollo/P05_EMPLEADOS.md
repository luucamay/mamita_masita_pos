# P05 — Administración de empleados

| Elemento | Resultado |
| --- | --- |
| Pantalla | `/empleados`, exclusiva de administrador; acceso en navegación |
| Tarjetas | Avatar con iniciales, nombre, correo, rol y estado |
| Alta | Nombre, correo, rol y contraseña inicial; API de servidor y Admin Auth API |
| Baja | Desactivar y reactivar, sin borrar identidad ni historial, confirmado por Omar |
| Base | `20261029163809_p05_employee_access.sql`, aplicada después de P01/P04 el 29/10 con autorización de Omar |
| Pruebas | 22 grupos SQL acumulados, 7 de lógica P05 y 4 de navegador aprobados |

## Comportamiento y archivos

`app/empleados/page.tsx` y `components/employees/employees-panel.tsx` presentan el equipo y el formulario. Los roles disponibles para el alta son Administrador, Atención, Cocina y Barista. No se incorporó carga de fotos ni cambio de rol/contraseña de empleados existentes. No se envían invitaciones ni correos: la administradora entrega la contraseña inicial por un canal privado. Reactivar conserva la contraseña y el UUID.

`app/api/employees/route.ts` permite consultar y crear; `app/api/employees/[id]/route.ts` cambia el acceso. Validan sesión activa, rol, origen de escritura y JSON. Las respuestas son privadas sin caché. `lib/employees.ts` comprueba además la RPC de preparación segura antes de construir el cliente privilegiado o consultar correos Auth. Si falta la migración, la pantalla informa la indisponibilidad y bloquea el alta; no usa las políticas amplias del esquema antiguo.

`lib/supabase/admin.ts` es exclusivo de servidor. Usa `SUPABASE_SECRET_KEY`; en desarrollo o build QA puede leerla del archivo privado `.env.admin.local`. En despliegue se configura como variable de servidor. La clave no pasa a props, navegador ni `NEXT_PUBLIC_*`. Las contraseñas de empleados solo viajan al servidor por la solicitud de alta y no se guardan en tablas de la aplicación ni registros de diagnóstico.

La migración agrega un registro privado de altas pendientes/completadas y eventos administrativos con RLS y sin acceso directo para usuarios. La identidad se crea mediante Admin Auth API, marcada en `app_metadata`; la RPC de finalización comprueba esa marca y el correo en Auth. No se insertan cuentas manualmente en Auth ni se adoptan cuentas existentes ajenas. El perfil toma nombre/rol de la reserva validada. Reintentar no duplica cuentas ni reactiva automáticamente un perfil desactivado.

Auth y PostgreSQL no comparten una transacción. Si Auth se completa pero falla el perfil, la identidad queda **registrada como alta pendiente**, sin perfil que permita usar la app. Se muestra un error recuperable y se puede reenviar el mismo formulario; después de recargar también se puede completar usando el mismo correo, nombre y rol. Se conserva la contraseña del primer intento; no se cambia silenciosamente. No se considera que el alta haya finalizado mientras falte el perfil. `lib/employee-provision.ts` contiene este flujo y sus pruebas con dependencias simuladas. La recuperación integral vía Data API real sigue pendiente.

Desactivar solo cambia `profiles.active`. P01 consulta el perfil activo en las operaciones/RLS, por lo que un token previo no conserva permisos. Esto bloquea el acceso a la aplicación; no elimina la identidad Auth ni invalida físicamente todos sus JWT. La propia cuenta administradora no puede desactivarse; un bloqueo transaccional y una segunda comprobación del actor evitan que dos administradores se desactiven simultáneamente y dejen cero administradores activos. Los cambios de estado comprueban `updated_at`; un conflicto exige actualizar la lista.

## Verificación

1. **Ahora:** como admin, abrir `/empleados`: debe cargar el equipo y permitir Agregar. Staff/Cocina/Barista no ven el acceso ni pueden usar la API.
2. Comprobar nombre, correo, rol, avatar y estado en cada tarjeta. Usar exclusivamente cuentas ficticias identificadas para las pruebas siguientes.
3. Agregar una cuenta ficticia con correo exclusivo y contraseña de al menos 12 caracteres, letras y números. Cerrar sesión e ingresar con esa cuenta; verificar rutas según rol.
4. En otra sesión de admin, desactivar esa cuenta ficticia. Su sesión previa debe perder lectura/operaciones; sus pedidos históricos deben conservarse.
5. Reactivarla e ingresar con el mismo correo/contraseña; no debe crearse un segundo perfil.
6. Probar correo duplicado, datos inválidos y el acceso propio protegido. Ante cambios simultáneos debe pedir actualizar, sin sobrescribir otro estado.
7. Revisar en 390 px y escritorio. El formulario tiene etiquetas y ayuda separadas; botones táctiles de al menos 44 px y avisos accesibles.

Comandos: `pnpm test:p05`, `pnpm test:p05:db`, `pnpm build:qa`, `pnpm test:modules --grep P05`.

Las pruebas SQL se ejecutaron en PostgreSQL 17 temporal con datos sintéticos. Las cuatro pruebas de navegador usan login QA real de lectura y una pantalla con empleados ficticios en `/qa-preview/employees`, protegida por rol y flag QA. Altas/cambios están interceptados; no se crearon ni desactivaron empleados reales. Las pruebas iniciales detectaron etiquetas ambiguas y una ruta PATCH no interceptada: se corrigieron las etiquetas y el patrón de prueba. Esa solicitud PATCH fue rechazada por la guarda real previa (503), sin cambios en perfiles. Las cuatro pruebas pasaron al repetir. Capturas escritorio/móvil revisadas en `test-results/modules/p05-*.png`, ignoradas por Git.

## Pendiente antes de publicar

Omar autorizó posteriormente aplicar las migraciones para pruebas. Se guardó una copia nueva de public y metadatos de funciones/permisos; P01/P04/P05 quedaron aplicadas. El alta real de una cuenta QA desde la app, su acceso, desactivación con sesión abierta y reactivación con las mismas credenciales pasaron. La cuenta se conserva inactiva. Ver [aplicación y evidencia](APLICACION_SUPABASE_2026-10-29.md). Antes de publicar queda resolver recuperación integral y comprobar la configuración de servidor en Vercel; no hubo push ni despliegue.

Antes de aplicar, los asesores remotos mostraban hallazgos por vista con privilegios del creador, funciones privilegiadas públicas y search_path mutable. Tras aplicar P01/P04/P05 esos hallazgos desaparecieron. Persisten los avisos informativos de RLS sin políticas en tablas sin acceso directo y la protección de contraseñas filtradas deshabilitada; ver el informe de aplicación enlazado arriba.

Referencias oficiales consultadas el 29/10/2026: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers) y [changelog](https://supabase.com/changelog). El cambio TLS anunciado para noviembre no modifica las firmas usadas; Node 22 emplea TLS moderno. La autorización toma el perfil vigente en PostgreSQL, sin depender de `user_metadata`.
