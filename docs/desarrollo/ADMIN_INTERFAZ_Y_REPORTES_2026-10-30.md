# Administración compacta y reportes
Fecha: 30/10/2026. Proyecto oficial: `mamita_masita_pos`. Rama: `desarrollo/mejoras-octubre-2026`.

## Cambios entregados

| Área | Comportamiento |
| --- | --- |
| Admin menú | Tres tarjetas con SVG: Nuevo producto, Productos del menú y Nueva categoría. Cada opción abre una ventana. |
| Productos | Búsqueda local por nombre/categoría, sin distinguir tildes o mayúsculas. Filtro Todos/Activos/Retirados. Edición conjunta de nombre, categoría y precio. |
| Retirar/reactivar | Retirar cambia `active` a falso; no borra el registro ni sus ventas. Reactivar conserva el mismo producto. Una categoría inactiva sigue ocultando sus productos en el menú operativo. |
| Categorías | Alta con destino Cocina/Café y lista de categorías con activación/desactivación dentro de la ventana. |
| Empleados | Tarjetas compactas con iniciales, nombre, correo, rol, acceso y acciones. Filtros en orden Administrador, Atención, Cocina, Barista. |
| Alta de empleado | Ventana con Cancelar, contraseña inicial manual o generada con Web Crypto y control para mostrarla. No se usa una contraseña común. |
| Historial del empleado | Pedidos de clientes registrados por esa persona; Hoy, Esta semana y rango de fechas. Muestra productos, estado, importes y quién cobró. |
| Historial general | Menos espacios/textos repetidos. Selector de mes para consultar meses anteriores o futuros. Conserva Diario/Semanal/Mensual y filtros. |
| Excel | Cabecera compacta, logo y resumen. Dos hojas: Ventas y Desglose. Datos numéricos, fechas tipadas, tablas nativas con filtros y totales calculados. |
| Promos, perfil y cobros | Se reducen márgenes, títulos repetidos y formularios largos. Se conservan las reglas y mensajes necesarios para operar. |
| Actualización | Icono de la cabecera. Empleados/Promos refrescan su estado; Cobros del equipo conserva el filtro seleccionado. |

Las ventanas usan `dialog` nativo: fondo inerte, foco contenido, Escape, cerrar y Cancelar. Durante un guardado no se permite cerrar accidentalmente la ventana. Una respuesta con error conserva el formulario.

## Reglas del historial por empleado

Omar confirmó que la venta se atribuye a **quien registró el pedido**, no a quien lo cobró. La consulta usa `orders.created_by`.

- El filtro es **fecha de registro del pedido, en Bolivia**. Hoy y semana de lunes a domingo; rango inclusivo de hasta 366 días.
- Solo incluye pedidos de clientes. Las compras personales tienen su historial en Perfil y aparecen en los reportes generales como compras de empleado.
- Registrado es la suma actual de esos pedidos. Cobrado suma sus recibos y ajustes firmados hasta el momento de la consulta. Los pendientes no se presentan como ingresos cobrados.
- La fecha de creación y el cobro pueden ser distintos. Este historial sirve para revisar atención; **el reporte general de caja sigue usando fecha de cobro**, sin cambiar P09/P10.
- Cobró identifica a los receptores de los pagos y ajustes. Un cobro mixto o una devolución puede involucrar varias personas.
- Se conservan los pedidos de empleados desactivados. Un administrador activo puede consultarlos.
- Páginas de 25 pedidos, orden por fecha e ID. Los cuadros corresponden al rango completo, no solo a la página.

## Cómo agregar una empleada y darle acceso

Caso ilustrativo: la dueña incorpora a Ana para Atención.

1. Entra con su cuenta de administradora y abre Empleados → Agregar empleado.
2. Escribe el nombre de Ana y un **correo de acceso único**. Puede asignar un identificador del negocio, por ejemplo `ana.atencion@mamita.local` (ejemplo ficticio). No es obligatorio usar su correo personal.
3. Elige Atención y genera una contraseña o escribe una de 12–128 caracteres, con letras y números. El generador crea una diferente en cada intento. Muéstrala y cópiala o guárdala antes de pulsar Crear acceso: después del alta se limpia el formulario.
4. Pulsa Crear acceso. El servidor crea la identidad de Supabase Auth y su perfil activo con el rol elegido. El alta es idempotente: un reintento del mismo formulario no debe duplicar la cuenta.
5. Entrega a Ana el correo de acceso y la contraseña por un canal privado. Ana entra en la pantalla de inicio de sesión con ambos; no necesita aceptar una invitación.
6. Cuando deje de trabajar, Desactivar acceso impide usar la aplicación y conserva la historia. Reactivar permite entrar con la misma cuenta y contraseña.

**La app no crea una casilla de correo**, ni una cuenta Gmail, ni envía la contraseña o una invitación. La cuenta se confirma administrativamente al crearla. Un identificador ficticio sirve para el acceso, pero no recibe mensajes de recuperación. Si se necesita recuperar por correo, usar una dirección real controlada por el negocio. No se agregó una pantalla de restablecimiento de contraseña en esta entrega.

La clave administrativa de Supabase solo se usa en el servidor para altas/listado de cuentas. Ya existe configuración privada local. Cuando se publique, la configuración privada de Vercel debe estar presente; nunca usar `NEXT_PUBLIC_` para esta clave.

## Cómo funciona Cobros del equipo

1. Cada usuario activo, incluida Administración, abre Perfil → Comprar con descuento de empleado.
2. Elige sus productos; se aplica **20 % fijo**, sin sumar la promoción del día.
3. Enviar compra a cobro crea la solicitud pendiente. Todavía no se registra como ingreso.
4. Atención o Administración abre Cobros del equipo, verifica los productos y elige el medio realmente recibido: Efectivo o QR.
5. Confirmar cobro y entrega registra el pago, marca los productos entregados y archiva la compra.
6. El importe neto aparece en los reportes generales, identificado como compra de empleado. También queda en el historial personal.
7. Una compra pendiente puede cancelarse; se conserva el registro y no genera ingreso. Si el comprador está desactivado, no se permite cobrarla.

Ejemplo: un producto de Bs 10 queda en Bs 8. Antes de confirmar, el ingreso es cero; al confirmar QR, se registran Bs 8 por QR. No hay integración bancaria: el botón confirma el pago recibido fuera de la app. Cocina y Barista no pueden confirmar cobros.

## Reportes y Excel

La exportación reutiliza la **misma consulta y filtros que la pantalla**:

- Diario: día seleccionado por fecha de cobro en Bolivia.
- Semanal: lunes a domingo de la fecha de referencia.
- Mensual: mes calendario completo. Mes `2026-09` se normaliza a `2026-09-01`; septiembre termina el 30, sin incluir octubre. Febrero bisiesto está contemplado.
- Medio de pago y tipo de compra filtran el detalle y el Excel. El resumen de caja de la pantalla conserva todos los medios, como se acordó en P10; el resumen del archivo corresponde solo a lo exportado.
- Ventas: Ítem, Cantidad e Ingreso total; incluye descuentos y ajustes/devoluciones.
- Desglose: Ítem, Cantidad, Ingreso neto, Pago y Tipo de compra. No se agrega una segunda tabla debajo de Ventas.
- Cabecera de ocho filas hasta los encabezados de tabla, frente a las trece anteriores. Logo en el extremo derecho para evitar superposición, colores naranja/crema, fuentes legibles y sin cuadrícula.
- Los importes/cantidades negativos se conservan para devoluciones. Los nombres que comienzan con `=` siguen siendo texto, no fórmulas.
- Períodos vacíos muestran cero y un mensaje; no inventan filas de venta.
- Se mantiene el generador ExcelJS del proyecto. El logo público está incluido explícitamente en el empaquetado de la ruta de exportación para Vercel.

## Archivos principales

| Archivo | Responsabilidad |
| --- | --- |
| `components/ui/modal.tsx` | Ventanas accesibles compartidas. |
| `components/menu/menu-admin.tsx` | Tres accesos, formularios y catálogo buscable; actualización local tras cada operación. |
| `app/menu-admin/page.tsx`, `lib/types.ts` | Catálogo administrativo con `updated_at` para detectar ediciones concurrentes. |
| `components/employees/employees-panel.tsx` | Filtros por rol, alta modal, contraseña generada y acceso al historial. |
| `components/employees/employee-sales-panel.tsx` | Filtros, resultados, paginación, estados de error y cancelación de solicitudes pendientes. |
| `lib/employee-sales.ts` | Contrato y validación de rangos/respuestas. |
| `app/api/employees/[id]/sales/route.ts` | Endpoint administrativo de lectura, sin caché; valida identidad, fechas y página. |
| `supabase/migrations/20261030143332_admin_employee_sales_history.sql` | Consulta invoker exclusiva de admin activo e índice por creador/fecha para clientes. |
| `lib/use-header-refresh.ts` | Integración de pantallas con estado local con la actualización de la cabecera. |
| `lib/report-filters.ts`, `components/reports/*` | Selector mensual, filtros compartidos y presentación compacta. |
| `lib/report-xlsx.ts`, `next.config.mjs` | Exportación de dos hojas, logo, formato y empaquetado del recurso. |
| `components/profile/*`, `components/promotions/*`, `components/employee-purchases/*` | Ajustes de espacio y jerarquía. |
| `middleware.ts` | API sin sesión responde JSON 401 en lugar de devolver el HTML de login. |

El guardado de un producto compara `updated_at` con la versión leída, para no sobrescribir silenciosamente otro cambio. Las ventas anteriores guardan nombre/precio/categoría en sus líneas y no se recalculan por editar el catálogo.

## Base de datos y preservación

La migración **`20261030143332_admin_employee_sales_history` ya está aplicada**. No ejecutarla otra vez.

Agrega solo una función de lectura y un índice parcial. No cambia Auth, roles, políticas, importes ni filas de ventas. La función usa `security invoker`, `search_path=''`, privilegios explícitos y verificación de administrador activo; RLS sigue vigente.

Antes de aplicar: copia privada de las once tablas públicas en `SUPABASE/RESPALDOS_PRIVADOS/2026-10-30_admin/before`: **10.380 filas**, incluyendo 944 pedidos, 942 pagos, 2.239 líneas, 6.021 eventos, 63 productos, 11 perfiles y cero movimientos nuevos de caja. Los dos requests de cliente previos también se incluyeron en la comparación de huellas.

Las huellas de las once tablas públicas y `private.customer_order_requests` coinciden antes/después de la migración. La actividad existente de la app se conserva. Esta copia de datos y metadatos no sustituye una recuperación integral PostgreSQL/Auth, que continúa pendiente.

El plan real de lectura filtrada usa `orders_customer_author_history_idx`. La consulta de ejemplo del servidor tardó unos 2 ms; no es una medida de latencia completa de la interfaz.

Los advisors mantienen el aviso previo de protección contra contraseñas filtradas desactivada y los avisos informativos de tablas internas sin políticas directas. No se cambiaron esas configuraciones.

## Verificación técnica

- Compilación de QA en `.next-qa`, separada del servidor de desarrollo de Omar.
- 42 pruebas Node de permisos, importes, descuentos, reportes, Excel y flujos; 7 pruebas de preparación.
- 64 grupos de pruebas SQL en PostgreSQL temporal local, con datos sintéticos. Incluyen atribución por creador, caja separada, límites de Bolivia, paginación, pedidos personales excluidos, cobros mixtos/devoluciones, permisos y conservación de ventas al retirar productos.
- 63 escenarios de navegador cubiertos: 62 aprobaron en la regresión inicial; el caso restante detectó Escape dentro del buscador. Tras corregirlo y ampliar los campos de fecha en móvil, aprobaron las 16 pruebas de las ventanas afectadas. El resto de resultados se reutilizó al no cambiar sus funciones. Capturas revisadas a 390 × 844 y 1365 × 900, sin desbordamiento de página. Ambas hojas del Excel se renderizaron y revisaron.
- Lecturas reales con cuentas QA existentes. Altas, productos, precios y activación/desactivación se simulan en el navegador; no se crean empleados ni ventas reales con la suite.
- Revisión del Excel exportado con Artifact Tool: recálculo, inspección de importes/fechas, escaneo de errores y render de ambas hojas. No se automatizó Microsoft Excel nativo.
- Verificado que el logo forme parte del trazado de archivos de la ruta de exportación.
- Escaneo de fuentes no ignoradas y archivos públicos compilados sin coincidencias de claves administrativas o contraseñas QA.

Para repetir: `pnpm build:qa`, `pnpm test:admin:ui` y `pnpm test:admin:db`. No usar el E2E general de ventas contra la base compartida. La guarda de pruebas generales y la marca de respaldo integral permanecen deshabilitadas.

## Guía de revisión para Omar

1. Abre Admin menú: deben verse solo los tres accesos, sin formularios largos.
2. Nuevo producto y Nueva categoría: abre cada ventana y pulsa Cancelar; verifica también Escape y el botón de cierre.
3. Productos del menú: busca “canahua” o “cafes”. Abre Editar y revisa Nombre, Categoría y Precio; Cancelar conserva el producto. Para un cambio real, guarda y confirma el mensaje.
4. Retirar debe conservar el producto en Todos/Retirados. Reactivar lo devuelve a Activos; revisar también que su categoría esté activa.
5. Empleados: prueba los filtros en orden Administrador/Atención/Cocina/Barista. Historial de ventas debe abrir la ventana de la persona correcta.
6. En el historial, prueba Hoy, Esta semana y un rango con fechas. Revisa quién registró frente a Cobró, los productos y los pedidos sin cobrar. Una persona que no registra pedidos tendrá un resultado vacío correcto.
7. Agregar empleado: revisa Generar contraseña, Mostrar y Cancelar. Sigue el caso de uso anterior cuando quieras registrar una persona real.
8. Historial general: elige Diario, Semanal y Mensual. Para un mes anterior, elige septiembre de 2026 y aplica. Cambia medio/tipo de compra y exporta.
9. En el Excel revisa ambas pestañas, cabecera/logo, fechas, cantidades, importes y suma final. No debe existir un desglose debajo de Ventas.
10. Perfil, Promos y Cobros del equipo deben tener espacios reducidos, controles legibles y actualización en la cabecera. En Cobros, cambiar el filtro y actualizar debe conservarlo.

No se hizo push, merge ni despliegue en Vercel. P15 no se inicia con este ajuste; queda la revisión funcional de Omar.
