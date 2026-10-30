# Guía de uso — Mamita Masita

Versión de entrega: 30/10/2026. Cada persona usa su propia cuenta. No se necesita Google ni un correo personal para crear accesos internos.

## Antes de empezar

La administradora entra con su cuenta. El menú de navegación permite abrir Historial, Admin menú, Empleados, Promos, Pedidos, Caja y Perfil. Atención abre directamente el menú de productos; Cocina y Barista abren su cola de preparación.

La aplicación necesita conexión para consultar, registrar y cobrar. Se puede instalar como PWA, pero no registra ventas sin internet. Si falla una operación, revisa el aviso y reintenta desde la misma ventana antes de crear otro pedido.

## 1. Crear y entregar un acceso

1. Empleados → Agregar empleado.
2. Escribe el nombre. El sistema sugiere el primer nombre como usuario: Ana Flores → `ana@mamita.local`.
3. Si ya existe, usa otro usuario, por ejemplo `ana2`. Esto no crea una casilla de correo.
4. Elige Atención, Cocina, Barista o Administrador. Genera una contraseña y crea el acceso.
5. En la ventana de credenciales, usa el ojo si necesitas verla y Copiar credenciales para entregarla en privado.

La contraseña recién creada está disponible mientras permanezcas en esa vista. Al recargar no se puede recuperar: el icono de llave permite copiar el usuario o generar una nueva contraseña con confirmación. La contraseña anterior dejará de servir para nuevos inicios de sesión. No se envían mensajes automáticamente.

Desactivar acceso conserva el historial. Reactivar permite volver a entrar. El historial de ventas atribuye los pedidos a quien los registró y muestra por separado quién cobró. Inicia en hoy y permite semana, mes y fechas. También muestra los cierres del empleado.

## 2. Tomar y modificar pedidos

1. Busca un producto o despliega su categoría y toca Agregar.
2. Abre Ver pedido y elige mesa 1–6, Para llevar u Otra. Otra admite una identificación flexible, como 6.1.
3. Revisa cantidades y total.
4. **Mesa:** registra el pedido; se cobra al terminar el consumo.
5. **Para llevar:** selecciona Efectivo o QR y confirma el cobro al registrar.

Antes de cerrar el pedido puedes agregar o quitar productos según su estado. Los ya entregados conservan su registro. Si la compra ya estaba cobrada y cambia el total, la ventana muestra el adicional o devolución que debes realizar y registrar por Efectivo/QR. Un conflicto de edición requiere actualizar y revisar; no vuelvas a crear el pedido como solución.

Los pedidos muestran sus productos, medio de pago y descuento. Preparación mide desde la creación hasta la entrega; Cuenta abierta mide hasta el cobro. Añadir productos no reinicia el tiempo original.

## 3. Preparar, entregar y consultar

Cocina y Café muestran automáticamente los productos de su área. Su personal marca la preparación/entrega; Atención y Administración consultan el pedido completo en Pedidos. La actualización en vivo necesita conexión; el botón superior permite volver a consultar.

Un pedido de Para llevar puede estar pagado y aún en preparación. La entrega y el cobro son hechos diferentes. Una vez completado el flujo, se consulta en Cerrados, que inicia por el día actual y permite cambiar fecha o consultar todo el historial.

Imprimir abre un ticket mediante el navegador. No conecta una impresora automáticamente con Cocina.

## 4. Abrir, cerrar y recibir caja

La caja es compartida y tiene un responsable por turno. Los cobros hechos por otras cuentas autorizadas durante ese turno también forman parte de la misma caja; cada movimiento identifica quién cobró.

**Primera apertura:** cuando todo el equipo vaya a usar esta versión, entra en Caja, cuenta el efectivo físico para cambio y confirma Abrir caja. Esa primera apertura activa el control de turnos. Las ventas anteriores no se agregan a ese turno.

**Al salir:** Caja → Cerrar y entregar caja. Cuenta todo el efectivo antes de retirar dinero. La pantalla compara inicial + cobros netos en efectivo con lo contado. QR se muestra aparte. Puedes registrar un retiro; indica el motivo si hay retiro o diferencia y confirma el conteo.

Ejemplo: abres con Bs 100, cobras Bs 50 en efectivo y Bs 20 en QR. El efectivo esperado es Bs 150. Si cuentas Bs 150 y retiras Bs 50, dejas Bs 100. QR no se suma al efectivo físico.

**Quien entra:** ingresa con su propia cuenta, elige Recibir caja e iniciar turno y cuenta lo recibido. Si cuenta Bs 95 cuando se declararon Bs 100, escribe la observación; queda registrada una diferencia de Bs 5 y el nuevo turno comienza con Bs 95.

Mientras la caja esté entregada y pendiente de recepción no se pueden confirmar nuevos cobros o devoluciones. Recibir abre el siguiente turno en la misma operación. Si cambia un cobro mientras estás contando, la aplicación pide actualizar el corte y revisarlo antes de cerrar.

La administradora puede consultar los cierres, importes dejados, retiros, diferencias y recepción desde Caja. El empleado también ve sus cierres en Perfil. No hay una notificación por WhatsApp o correo.

## 5. Compras personales y Cobros del equipo

Perfil → Comprar con descuento permite enviar una compra propia con 20 % fijo, sin acumular la promoción del día. No se confirma el pago solo por enviarla.

Cobros del equipo es la bandeja de Atención/Administración para cobrar esas compras. Ejemplo: Ana solicita un café de Bs 10 desde Perfil; cuesta Bs 8. Cuando paga, el cajero elige Efectivo o QR y confirma cobro/entrega. Ana ve su compra en Mis compras; el cajero la ve en Pendientes o Cobradas.

Las compras personales cobradas se incluyen en ingresos y se identifican como Empleado. No deben cobrarse de nuevo como un pedido de cliente.

## 6. Productos, promociones y reportes

Admin menú ofrece Nuevo producto, Productos del menú y Nueva categoría. En productos puedes buscar, editar nombre/categoría/precio y retirar o reactivar. Retirar conserva las ventas anteriores.

Promos permite programar una promoción general para una fecha de Bolivia. Cada pedido conserva el porcentaje con que se creó, también para los productos agregados después. No se acumula con el descuento personal del empleado.

Historial inicia en hoy. Diario, Semanal y Mensual cambian el período; el selector mensual permite consultar un mes anterior. Total/Efectivo/QR corresponden al período y tipo de compra elegidos. El filtro de medio de pago cambia el detalle, conservando la referencia de caja del período.

Exportar Excel descarga el período y filtros seleccionados. Ventas contiene Ítem/Cantidad/Ingreso total; Desglose separa medio de pago y tipo de compra. Se usa fecha de cobro/ajuste en Bolivia, semana de lunes a domingo y mes calendario. Las devoluciones reducen el ingreso; el efectivo inicial y los retiros de caja no son ventas.

## 7. Revisión rápida con la dueña

1. Verifica cuentas y roles; entrega cada acceso en privado.
2. Consulta hoy, una semana y un mes con ventas y descarga sus Excel.
3. Revisa el menú y precios sin crear compras ficticias.
4. Comprueba Pedidos/Cocina/Café en dos dispositivos conectados.
5. Al empezar la operación real, abre caja con el importe físico contado; al cambio de turno, cierra y recibe con cuentas diferentes.
6. En Android e iOS reales, verifica instalación, inicio de sesión, sonido y uso en pantalla completa. Su comportamiento puede depender de permisos del dispositivo.
