# Accesos, Atención y cambios de turno

Fecha: 30/10/2026. Proyecto oficial: `mamita_masita_pos`. Rama: `desarrollo/mejoras-octubre-2026`.

| Área | Cambio implementado |
| --- | --- |
| Alta de empleados | Usuario sugerido a partir del primer nombre, sin tildes, con sufijo fijo `@mamita.local`. Puede editarse, por ejemplo `ana2`, si ya existe. |
| Credenciales | Icono de llave en cada tarjeta; ventana con usuario, contraseña nueva oculta, ojo y Copiar credenciales. |
| Cuentas anteriores | Generar una nueva contraseña requiere confirmación explícita. No se recupera ni almacena una contraseña antigua. |
| Historial del empleado | Inicia por el día actual de Bolivia; incluye Hoy, Esta semana, Este mes y rango. También muestra sus cierres de caja en las fechas elegidas. |
| Atención | Mesas 1–6, Para llevar y Otra en una sola fila. Sin mesa 7; Otra conserva las mesas divididas o nombres libres. |
| Cocina/Café | Tarjetas compactas, cantidad y producto en una línea, acciones legibles y alertas de nuevos pedidos. |
| Cobros del equipo | Explicación y ejemplo de la compra personal del empleado y de la confirmación por Atención/Administración. |
| Caja y turnos | Apertura con efectivo inicial, cierre con conteo/retiro y recepción por el siguiente responsable. |
| Monitoreo | Cierres del equipo para Administración, cierres personales en Perfil e historial del empleado, aviso de recepción y actualización en vivo con respaldo de 30 segundos. |

## 1. Crear y entregar el acceso

Ejemplo: la dueña incorpora a Ana Flores para Atención.

1. Empleados → Agregar empleado.
2. Escribe el nombre completo. La app sugiere `ana`; el sufijo `@mamita.local` ya está puesto. Puede cambiar el usuario antes de guardar. Si existe, usar otro como `ana2` o reactivar la cuenta anterior si corresponde a la misma persona.
3. Elige el rol y genera una contraseña o escribe una válida. No se crea una contraseña común para todos.
4. Crear acceso abre la ventana de credenciales. La contraseña está oculta: el ojo permite verla y Copiar credenciales copia un mensaje con usuario y contraseña para compartirlo de forma privada.
5. Ana inicia sesión con **`ana@mamita.local` y su contraseña**. No interviene Google OAuth ni se crea un buzón de correo. El enlace de la app se comparte aparte.

El icono de llave vuelve a abrir las credenciales. La contraseña recién creada o restablecida se conserva **solo en memoria de esta vista**: no se guarda en localStorage/sessionStorage ni como texto recuperable en Supabase. Al recargar o salir de la vista, se pierde esa copia. La app no envía WhatsApp ni correos automáticamente.

Si el alta se recupera de una operación anterior, puede no conocerse la contraseña inicial: se muestra el usuario y la opción de generar una nueva; no se presenta una contraseña supuesta como si fuera la vigente.

### Cuentas anteriores

1. Abre la llave de la tarjeta.
2. Generar nueva contraseña muestra qué cuenta se cambiará.
3. Confirmar nueva contraseña realiza el cambio. La anterior deja de servir para un nuevo inicio de sesión.
4. Copia y entrega las nuevas credenciales.

Esto cambia una contraseña real cuando se confirma; no activa una cuenta desactivada ni altera sus ventas o rol. La cuenta administradora actual no puede cambiar su propia contraseña desde las tarjetas de empleados.

Los reintentos reutilizan el identificador de operación. El servidor verifica administrador activo, reserva el cambio, aplica Admin Auth y comprueba la marca de Auth antes de cerrar la auditoría. El registro guarda una huella HMAC, no la contraseña. Ante un error de red, reintentar en la misma ventana: no generar otra contraseña mientras se desconoce el resultado. Una operación pendiente bloquea otro cambio para la misma cuenta durante diez minutos; los reintentos de la misma operación pueden completarla.

## 2. Qué es Cobros del equipo

Son las **compras personales con descuento de empleado** que alguien envía desde Perfil.

Ejemplo: Ana compra un café de Bs 10. En Perfil se aplica 20 % y envía una compra de Bs 8. Esa compra aparece pendiente en Cobros del equipo. Atención o Administración recibe los Bs 8, elige Efectivo o QR y confirma cobro y entrega. Entonces queda cobrada, archivada e incluida en los reportes como compra de empleado.

Mis compras muestra las de la persona que inició sesión. Cobros del equipo permite a los cajeros cobrar las solicitudes del equipo. Cancelar una compra pendiente conserva el historial y no genera ingresos. Elegir Efectivo/QR declara lo recibido fuera de la app; no se consulta al banco.

## 3. Caja compartida y turnos

Omar confirmó **Abrir → Cerrar y entregar → Recibir**, con efectivo inicial, retiro opcional y observación por diferencias. Hay una sola caja física y un responsable por turno; los horarios no se fijan en el sistema.

### Abrir

El responsable entra con su propia cuenta de Atención o Administración, abre Caja y turnos y cuenta el efectivo inicial para cambio. Introduce el importe y confirma el conteo.

Solo puede haber un turno abierto o una entrega pendiente. Otro empleado puede ayudar a cobrar durante ese turno: los recibos quedan en la caja compartida e identifican quién cobró. Solo el responsable o Administración puede cerrar el turno.

La primera apertura activa este control para el negocio. Antes de ella, los cobros anteriores funcionan como hasta ahora. La primera caja no importa ventas antiguas: el dinero físico presente se declara como efectivo inicial, y se capturan los recibos nuevos desde la apertura.

### Cerrar y entregar

La pantalla muestra los movimientos con pedido, fecha/hora, medio, importe y cobrador. Suma:

`Efectivo esperado = efectivo inicial + cobros en efectivo − devoluciones en efectivo`

QR aparece como referencia separada. Se incluyen compras de empleados cobradas, adicionales y devoluciones, evitando duplicar el pago inicial de un pedido para llevar.

1. Cerrar y entregar caja abre el corte a revisar.
2. Cuenta **todo el efectivo antes de retirar dinero** e introduce Efectivo contado.
3. Si se retira efectivo al cerrar, introduce el retiro. La app calcula lo que dejas: contado menos retiro. Este campo es para dinero que se retira después del conteo.
4. Explica cualquier diferencia o retiro. Administración también debe explicar un cierre por otro responsable.
5. Confirma el conteo y guarda el cierre.

Ejemplo: Ana abre con Bs 100, cobra Bs 50 en efectivo y Bs 20 por QR. Debe contar Bs 150. Si retira Bs 50 al cerrar, entrega Bs 100. El retiro y el efectivo inicial no se registran como nuevas ventas.

Un conteo distinto de lo esperado se conserva como **diferencia declarada**, con observación. La aplicación no lo presenta como caja cuadrada. Si hubo nuevos cobros durante el conteo, obliga a actualizar el corte y revisar antes de confirmar.

El cierre guarda una copia de los movimientos. Una devolución de ese pedido durante otro turno se registra en la caja de ese otro turno y no reescribe el cierre anterior.

### Recibir

Quien entra usa su propia cuenta. Ve quién entregó, cuánto declaró que dejó y la hora. Cuenta e introduce el efectivo recibido; no se rellena automáticamente.

- Si recibe lo declarado, confirma y se abre su turno con ese importe.
- Si recibe menos o más, registra una observación. La diferencia queda visible y su turno comienza con **el efectivo que recibió realmente**.
- Recibir una entrega propia requiere observación y queda identificado como tal; no simula una verificación por otra persona.

Continuando el ejemplo, la siguiente persona recibe Bs 95 en vez de los Bs 100 declarados. Queda una diferencia de recepción de −Bs 5 y el turno nuevo abre con Bs 95.

Mientras una caja activada está entregada y aún no fue recibida, la app pide abrir/recibir antes de aceptar nuevos cobros o devoluciones. Los pedidos de mesa pueden registrarse y prepararse; el cobro necesita un turno activo. Un intento fallido de cobrar un pedido para llevar revierte también su creación, sin dejar una venta parcial.

### Qué ve la dueña

Caja y turnos muestra los cierres del equipo: responsable, horas, efectivo, QR, dinero dejado, retiro y diferencias de cierre/recepción. Cada detalle conserva los movimientos y quién cobró; también quién recibió y su observación.

El empleado ve sus cierres de hoy en Perfil. Administración puede abrir Empleados → Historial de ventas y ver los cierres de esa persona con las mismas fechas del filtro. Las ventas por empleado se atribuyen a quien registró el pedido; los cierres se atribuyen al responsable de la caja.

Las pantallas escuchan cambios de Supabase Realtime y vuelven a consultar, con respaldo de 30 segundos, reconexión y actualización desde la cabecera. No se envían notificaciones por WhatsApp o correo a la dueña.

## 4. Pedidos, Cocina e impresión

Pedidos conserva las tarjetas en vivo y sus tiempos de Preparación/Cuenta abierta. Cocina recibe automáticamente los productos de categorías destinadas a Cocina; Café recibe los de sus categorías. Cada cola muestra cantidad, producto, mesa, hora y acción de preparación/entrega. No hace falta imprimir para recibir el pedido digitalmente.

Imprimir abre el diálogo de impresión del navegador con el ticket del pedido, productos, precios y descuentos. No conecta automáticamente una impresora física con Cocina. La integración con una impresora sigue fuera de esta entrega.

Se retiraron espacios y textos repetidos en las colas. Se corrigió una regla CSS global que anulaba los tamaños de texto definidos en los controles; los botones de mesa ahora pueden ajustarse sin superponer Para llevar y Otra en teléfonos pequeños.

## 5. Archivos y base de datos

| Archivo o grupo | Responsabilidad |
| --- | --- |
| `components/employees/employees-panel.tsx` | Usuario local, sugerencia del primer nombre, llave de credenciales y copia temporal en memoria. |
| `components/employees/credentials-panel.tsx` | Ojo, copia y confirmación explícita de cambio de contraseña; no comparte una contraseña anterior si el cambio tiene resultado incierto. |
| `lib/employee-credentials.ts` | Normalización de usuario, dominio, generador y mensaje de credenciales. |
| `app/api/employees/[id]/password/route.ts`, `lib/employees.ts`, `lib/supabase/admin.ts` | Cambio por Admin Auth desde servidor, comprobación de permisos, CSRF, huella HMAC e idempotencia. |
| `components/employees/employee-sales-panel.tsx`, `lib/employee-sales.ts` | Acceso a Este mes y cierres del empleado, con inicio por hoy. |
| `app/caja/page.tsx`, `components/cashbox/*`, `lib/cashbox*` | Apertura, cierre, recepción, movimientos, diferencias, aviso e historial. |
| `lib/use-cashbox-updates.ts` | Realtime, agrupación de eventos, reconexión y respaldo de lectura. |
| `app/perfil/page.tsx`, `components/app-shell.tsx`, `lib/permissions.ts` | Caja en navegación, permisos de Atención/Administración y cierres propios en Perfil. |
| `components/menu/menu-home.tsx`, `components/kitchen/*`, `components/cafe/*`, `app/globals.css` | Mesas 1–6 en una fila y densidad/legibilidad de Atención y colas. |
| `app/compras-empleados/page.tsx` | Explicación breve y ejemplo de las compras personales. |
| `supabase/migrations/20261030161805_shift_cashbox_and_employee_passwords.sql` | Estructuras, RPC, permisos, auditoría y asociación transaccional de recibos. |

La migración **ya está aplicada**. No ejecutarla otra vez.

- `public.cash_shifts`: turnos, cierres y recepción; RLS, solo lectura directa autorizada. Los cambios se hacen con funciones protegidas.
- Tablas privadas: configuración inicialmente desactivada, asociación de recibos a turnos, idempotencia y eventos de caja, reservas/auditoría de cambios de contraseña.
- Public RPC invoker → funciones privadas con comprobación de sesión/rol activo. Las operaciones de caja y los insert de pagos comparten un bloqueo transaccional para que no se pierdan recibos en un cambio de turno.
- Se agregó `cash_shifts` a Realtime. No se cambiaron las políticas de las ventas anteriores.
- No se modifican contraseñas al aplicar la migración. Un cambio requiere confirmación desde la ventana de credenciales.

Respaldo privado previo: once tablas públicas, **10.386 filas**, con 945 pedidos, 942 pagos, 2.241 líneas, 6.024 eventos, 63 productos y 11 perfiles. Se conservó la actividad que ya había hecho Omar durante la revisión; no se borró para recuperar conteos anteriores. Las doce huellas comparadas (once tablas anteriores y requests de cliente) coincidieron inmediatamente antes/después de la migración. La copia y metadatos no equivalen a una recuperación integral PostgreSQL/Auth.

Los advisors no muestran un nuevo fallo de permisos en la tabla pública. Las tablas privadas tienen RLS y acceso directo revocado: los avisos informativos de ausencia de políticas directas corresponden a ese diseño de denegación. Se mantiene el aviso previo de protección contra contraseñas filtradas desactivada; no se cambió Auth. Referencias: [políticas y acceso](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## 6. Pruebas y revisión

- Build QA separado en `.next-qa`, sin detener localhost:3000.
- 72 grupos SQL aprobados en PostgreSQL temporal con datos ficticios. Incluyen modo desactivado compatible, caja compartida, inicial, descuentos, retiro, diferencias, devolución en otro turno, permisos, idempotencia y concurrencia entre cobro/cierre.
- 45 pruebas Node y 7 pruebas de preparación aprobadas.
- 72 escenarios de navegador cubiertos y aprobados entre la regresión general y las repeticiones focalizadas: primera ejecución 69/71; las dos comprobaciones antiguas de colas se adaptaron al texto compacto cantidad × producto y pasaron. La actualización Realtime de caja agregó el escenario 72 y pasó con un evento sintético sobre la suscripción real, sin escribir un turno.
- La repetición focalizada aprobó 13/14; el caso restante inició la siguiente sesión antes de terminar Salir. Se corrigió la espera de la prueba y se aprobó tres veces consecutivas. No se relajaron permisos ni se reactivaron cuentas para probar.
- Revisión visual aprobada a 320/360/390 px y escritorio de 1365 px: mesas sin solapamiento, credenciales ocultas, colas compactas y modales de cierre/recepción legibles. Se corrigió la regla global de tipografía que anulaba los tamaños de Tailwind. Build QA aprobado y escaneo de secretos sin coincidencias en código ni recursos públicos.
- Las altas, cambios de contraseña, aperturas, cierres y recepciones se simulan en el navegador. No se prueba cambiando las contraseñas de trabajadores reales ni abriendo la caja compartida real.
- Teléfonos simulados: 320, 360 y 390 px; escritorio de 1365 px. No se dispone de Android/iOS físicos ni de impresora para certificar su operación nativa.

### Revisar sin activar la caja compartida

1. Empleados → Agregar empleado: escribe un nombre y verifica la sugerencia del usuario y el sufijo. Cancela si solo estás revisando el formulario.
2. Llave de una cuenta: verás el usuario; solo habrá contraseña disponible si fue creada/restablecida en esta vista. Generar nueva contraseña exige confirmación y cambia el acceso real.
3. Historial del empleado: debe abrir por hoy; prueba Esta semana, Este mes y fechas. Revisa la sección de cierres.
4. Atención → agrega un producto → Ver pedido: verifica 1–6, Para llevar y Otra en una sola línea; Otra permite una mesa como 6.1.
5. Cobros del equipo: lee el ejemplo y revisa Pendientes/Cobradas. Cocina y Café deben mostrar sus productos en tarjetas compactas.
6. Caja: puedes abrir el formulario y Cancelar. **Confirmar la primera apertura activa el control real del negocio.** Hacerlo cuando el personal vaya a operar con esta versión.
7. Cuando se inicie la operación real: apertura → venta/cobro → cierre con conteo → ingreso con la cuenta siguiente → recepción. La dueña revisa la historia y las diferencias desde Caja.

## 7. Entrega y reversión

Sin push, merge ni despliegue en Vercel. La lectura final confirma control desactivado, cero turnos, cero asociaciones de recibos y cero reservas de contraseña. Las doce huellas de datos anteriores siguen iguales a la copia previa de esta entrega: 945 pedidos y 942 pagos. Ver [evidencia sanitizada](../../../SUPABASE/evidencias/turnos_accesos_2026-10-30.json).

Comandos de reproducción: `pnpm build:qa`, `pnpm test:cashbox:db`, `pnpm test:cashbox:ui`. La prueba SQL crea una base temporal sintética; la prueba UI usa cuentas QA y lecturas del backend compartido, interceptando las escrituras de negocio.

Mientras no se haya abierto una caja real, el código anterior es compatible con las estructuras nuevas inactivas. Tras activar el control, una reversión debe conservar una interfaz para recibir/abrir caja: volver solo el código no desactiva las guardas de Supabase ni revierte los turnos. No restaurar una copia antigua sobre ventas nuevas ni modificar registros financieros para cuadrar pruebas.

P15 queda pendiente de revisión funcional, comprobación en dispositivos reales y coordinación de publicación con Omar; la validación técnica de esta entrega queda documentada aquí.
