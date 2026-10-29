# P05 — Administración de empleados

| Elemento | Resultado |
| --- | --- |
| Pantalla | `/empleados`, exclusiva de administrador; acceso en navegación |
| Tarjetas | Avatar con iniciales, nombre, correo, rol y estado |
| Alta | Nombre, correo, rol y contraseña inicial; API de servidor y Admin Auth API |
| Baja | Desactivar y reactivar, sin borrar identidad ni historial, confirmado por Omar |
| Base | `20261029160502_p05_employee_access.sql`, depende de P01; NO aplicada remotamente |
| Pruebas | 22 grupos SQL acumulados, 7 de lógica P05 y 4 de navegador aprobados |

## Comportamiento y archivos

`app/empleados/page.tsx` y `components/employees/employees-panel.tsx` presentan el equipo y el formulario. Los roles disponibles para el alta son Administrador, Atención, Cocina y Barista. No se incorporó carga de fotos ni cambio de rol/contraseña de empleados existentes. No se envían invitaciones ni correos: la administradora entrega la contraseña inicial por un canal privado. Reactivar conserva la contraseña y el UUID.

`app/api/employees/route.ts` permite consultar y crear; `app/api/employees/[id]/route.ts` cambia el acceso. Validan sesión activa, rol, origen de escritura y JSON. Las respuestas son privadas sin caché. `lib/employees.ts` comprueba además la RPC de preparación segura antes de construir el cliente privilegiado o consultar correos Auth. Si falta la migración, la pantalla informa la indisponibilidad y bloquea el alta; no usa las políticas amplias del esquema antiguo.

`lib/supabase/admin.ts` es exclusivo de servidor. Usa `SUPABASE_SECRET_KEY`; en desarrollo o build QA puede leerla del archivo privado `.env.admin.local`. En despliegue se configura como variable de servidor. La clave no pasa a props, navegador ni `NEXT_PUBLIC_*`. Las contraseñas de empleados solo viajan al servidor por la solicitud de alta y no se guardan en tablas de la aplicación ni registros de diagnóstico.

La migración agrega un registro privado de altas pendientes/completadas y eventos administrativos con RLS y sin acceso directo para usuarios. La identidad se crea mediante Admin Auth API, marcada en `app_metadata`; la RPC de finalización comprueba esa marca y el correo en Auth. No se insertan cuentas manualmente en Auth ni se adoptan cuentas existentes ajenas. El perfil toma nombre/rol de la reserva validada. Reintentar no duplica cuentas ni reactiva automáticamente un perfil desactivado.

Auth y PostgreSQL no comparten una transacción. Si Auth se completa pero falla el perfil, la identidad queda **registrada como alta pendiente**, sin perfil que permita usar la app. Se muestra un error recuperable y se puede reenviar el mismo formulario; después de recargar también se puede completar usando el mismo correo, nombre y rol. Se conserva la contraseña del primer intento; no se cambia silenciosamente. No se considera que el alta haya finalizado mientras falte el perfil. `lib/employee-provision.ts` contiene este flujo y sus pruebas con dependencias simuladas. La recuperación integral vía Data API real sigue pendiente.

Desactivar solo cambia `profiles.active`. P01 consulta el perfil activo en las operaciones/RLS, por lo que un token previo no conserva permisos. Esto bloquea el acceso a la aplicación; no elimina la identidad Auth ni invalida físicamente todos sus JWT. La propia cuenta administradora no puede desactivarse; un bloqueo transaccional y una segunda comprobación del actor evitan que dos administradores se desactiven simultáneamente y dejen cero administradores activos. Los cambios de estado comprueban `updated_at`; un conflicto exige actualizar la lista.

## Verificación

1. **Ahora:** como admin, abrir `/empleados`: debe verse aviso de módulo no habilitado y Agregar deshabilitado mientras la base compartida no tenga P01/P05. Staff/Cocina/Barista no ven el acceso ni pueden usar la API.
2. **Después de habilitar un entorno de escritura:** abrir Empleados como admin y comprobar nombre, correo, rol, avatar y estado en cada tarjeta.
3. Agregar una cuenta ficticia con correo exclusivo y contraseña de al menos 12 caracteres, letras y números. Cerrar sesión e ingresar con esa cuenta; verificar rutas según rol.
4. En otra sesión de admin, desactivar esa cuenta ficticia. Su sesión previa debe perder lectura/operaciones; sus pedidos históricos deben conservarse.
5. Reactivarla e ingresar con el mismo correo/contraseña; no debe crearse un segundo perfil.
6. Probar correo duplicado, datos inválidos y el acceso propio protegido. Ante cambios simultáneos debe pedir actualizar, sin sobrescribir otro estado.
7. Revisar en 390 px y escritorio. El formulario tiene etiquetas y ayuda separadas; botones táctiles de al menos 44 px y avisos accesibles.

Comandos: `pnpm test:p05`, `pnpm test:p05:db`, `pnpm build:qa`, `pnpm test:modules --grep P05`.

Las pruebas SQL se ejecutaron en PostgreSQL 17 temporal con datos sintéticos. Las cuatro pruebas de navegador usan login QA real de lectura y una pantalla con empleados ficticios en `/qa-preview/employees`, protegida por rol y flag QA. Altas/cambios están interceptados; no se crearon ni desactivaron empleados reales. Las pruebas iniciales detectaron etiquetas ambiguas y una ruta PATCH no interceptada: se corrigieron las etiquetas y el patrón de prueba. Esa solicitud PATCH fue rechazada por la guarda real previa (503), sin cambios en perfiles. Las cuatro pruebas pasaron al repetir. Capturas escritorio/móvil revisadas en `test-results/modules/p05-*.png`, ignoradas por Git.

## Pendiente antes de publicar

Resolver recuperación, revisar divergencias del esquema, aplicar P01 y P05 por el procedimiento acordado y probar el ciclo real Auth/perfil con identidades ficticias. Verificar clave administrativa de servidor en el destino Vercel. No hubo migración, push ni despliegue. No se afirma integración remota aprobada por las pruebas simuladas.

Se consultaron los asesores de seguridad remotos en lectura: conservan los hallazgos del esquema anterior, entre ellos [vista con privilegios del creador](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [funciones privilegiadas ejecutables por anónimos](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [search_path mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable). La corrección P01 está preparada localmente. Ese informe remoto no inspecciona las funciones nuevas aún no aplicadas; sus permisos se verificaron en el PostgreSQL temporal.

Referencias oficiales consultadas el 29/10/2026: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers) y [changelog](https://supabase.com/changelog). El cambio TLS anunciado para noviembre no modifica las firmas usadas; Node 22 emplea TLS moderno. La autorización toma el perfil vigente en PostgreSQL, sin depender de `user_metadata`.
