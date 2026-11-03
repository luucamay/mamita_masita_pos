# Acceso en vivo y compartir la aplicación

Fecha: 03/11/2026. Rama: `desarrollo/mejoras-octubre-2026`. Sin migraciones ni cambios de configuración en Supabase.

| Cambio | Comportamiento |
| --- | --- |
| Desactivar acceso | Después de confirmar la desactivación, el servidor emite un aviso Realtime para comprobar las sesiones abiertas. |
| Sesión del empleado | Comprueba su propio perfil; si ya no está activo, oculta el contenido, cierra su sesión y vuelve al login. |
| Segundo plano / desconexión | Se comprueba al volver a la pantalla o recuperar conexión; respaldo periódico cada 15 segundos mientras la app está visible y conectada. |
| Compartir app | En la ventana de credenciales aparece Compartir app por WhatsApp, también al crear una cuenta. Abre un borrador con el enlace y cómo instalar. |
| Contraseña inicial | Se conserva el ojo y la copia temporal de la contraseña recién creada/restablecida; no se añade consulta permanente de contraseñas. |

## Acceso

`admin_set_employee_active` sigue siendo la operación protegida existente. La desactivación y los permisos de RLS no dependen de que llegue la notificación. Después de un resultado correcto, `setEmployeeActive` envía `check-access` mediante HTTP Broadcast, sin abrir un WebSocket en el servidor. Si falla el envío no se deshace una desactivación confirmada.

La señal pública lleva únicamente un objeto vacío: sin ID, nombre, correo, estado, credenciales ni tokens. Es una indicación para volver a consultar, nunca una prueba de autorización. Una señal de un tercero no expulsa por sí misma a nadie: `/api/auth/access` comprueba el usuario autenticado y su perfil actual en el servidor. Cuentas activas conservan su sesión.

El endpoint devuelve `private, no-store`: 200 con ID/rol propios; 401 si no hay sesión válida o el perfil no tiene acceso; 503 si no se puede verificar por un fallo temporal. Los errores de red o de consulta no se interpretan como desactivación. No se concede acceso operativo a partir del contenido del Broadcast.

El cliente agrupa avisos, evita verificaciones simultáneas, cancela lecturas al desmontar y oculta contenido al confirmar el rechazo. Usa `signOut({scope:'local'})` para esa sesión; el SDK propaga el cierre a otras pestañas del mismo navegador. Cada dispositivo conectado recibe su propia señal y comprobación. Un dispositivo suspendido o sin internet no puede reaccionar instantáneamente: verifica al regresar. Un cambio directo en la base, fuera de la pantalla Empleados, queda cubierto por la comprobación periódica.

El middleware permite al endpoint distinguir una caída temporal de Auth de una denegación real; el endpoint realiza su propia autenticación. Las otras rutas conservan sus comprobaciones previas.

## Compartir por WhatsApp

1. Administración → Empleados → crear un acceso o abrir el icono de llave de una tarjeta.
2. Pulsar Compartir app por WhatsApp.
3. Elegir destinatario, revisar el borrador y enviarlo manualmente.

El enlace usa el dominio de producción informado por `VERCEL_PROJECT_PRODUCTION_URL`; fuera de Vercel usa el origen actual. Solo incluye `/login`, sin parámetros, sesiones o fragmentos. No incorpora usuario ni contraseña. El texto explica abrir la app e instalar mediante Instalar app o Agregar a pantalla de inicio.

La acción no instala silenciosamente la PWA ni envía mensajes por sí misma. La empleada completa la instalación desde el navegador de su teléfono.

## Contraseñas

Es posible mostrar la contraseña que acaba de crearse porque la interfaz todavía la tiene en memoria. Se conserva oculta por defecto y se revela por acción explícita. Al recargar o salir de esa vista no se puede recuperar desde Supabase; para entregar otra se genera una nueva con confirmación.

No se guardan contraseñas legibles en perfiles, tablas propias, localStorage o sessionStorage. El botón WhatsApp comparte el enlace por separado. La copia de credenciales sigue siendo una acción explícita del administrador; debe entregarse privadamente al destinatario correcto.

No se agregó un cambio obligatorio de contraseña en el primer ingreso ni recuperación por correo para `@mamita.local`; esos flujos no existen en esta entrega. No presentar una recomendación como una función implementada.

Referencias: [Broadcast de Supabase](https://supabase.com/docs/guides/realtime/broadcast), [almacenamiento de contraseñas de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Verificación

- 51 pruebas de lógica aprobadas, incluidas distinción de errores transitorios/denegación, aviso sin datos sensibles y enlace de WhatsApp sin credenciales.
- Aviso real entregado en un canal temporal de Supabase, sin cambios de filas.
- Compilaciones QA y entrega aprobadas; tipos comprobados.
- Casos de navegador: borrador WhatsApp, contraseña oculta/no recuperable, aviso falso con cuenta activa, sesión rechazada, dos pestañas, administración sin expulsión, respaldo periódico, regreso desde segundo plano y endpoint autenticado.
- Administración y descarga/conciliación de Excel comprobadas con la cuenta QA administradora.
- Revisión visual de la ventana de credenciales a 390 y 1365 px; sin recortes ni desbordamiento.
- Cobertura de navegador: 13 escenarios únicos entre acceso y administración, más uno de la compilación de entrega. La ejecución final de acceso/administración aprobó 12/13 inicialmente; el caso restante instalaba el reloj simulado después de crear los intervalos. Se corrigió el montaje y pasaron las cuatro repeticiones de respaldo/regreso a primer plano. No se cambió el temporizador de producción para hacer pasar la prueba.
- La primera ejecución había intentado usar Atención QA inactiva y se interrumpió; se usó Cocina QA activa sin modificar los perfiles. El caso de permisos de historial también usa un rol no administrador activo y espera el cierre completo antes del siguiente login.
- Tipos sin errores, builds QA/entrega aprobados y escaneo de seis secretos locales sin coincidencias en fuente o 124 recursos estáticos. Evidencias en `test-results/access-sharing-*`, ignoradas por Git, y [resumen sanitizado](evidencias/accesos_2026-11-03.json).
- Cuentas y altas/cambios de estado simulados en las pruebas de navegador. La cuenta QA de Atención existente estaba desactivada; se conservó así y se usó Cocina QA para comprobar el cierre. No se reactivaron empleados ni se cambiaron sus contraseñas para probar.
- Sin SQL, migraciones, ventas de prueba, cambios de roles o modificaciones de las cuentas del negocio. Las autenticaciones de QA crean únicamente sus sesiones de prueba.

## Guía de revisión

1. Abrir la versión nueva en dos navegadores o teléfonos con cuentas distintas: administración y empleado de prueba.
2. Desde Empleados, desactivar la cuenta del segundo dispositivo. Con conexión debe volver al login sin pulsar Actualizar; administración debe permanecer dentro.
3. Reactivar desde administración. El empleado puede iniciar sesión nuevamente con su cuenta.
4. Crear un acceso de prueba identificado y comprobar la ventana de credenciales: ojo, Copiar y Compartir app por WhatsApp.
5. Revisar que el borrador contenga el enlace público y las instrucciones de instalación; la contraseña se entrega aparte.

La actualización se publica únicamente en la rama de desarrollo para revisión móvil; no se integra main automáticamente. La revisión física de Android/iOS y la aceptación de la dueña se realizan con la versión publicada correspondiente.
