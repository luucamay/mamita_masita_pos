Seed: mvp.md

---

Source: mvp.md

```
# Restaurant POS & Order Management System (MVP)

## Objective

Build a web-based Point of Sale (POS) system for a small café.

## Description

There will be a MAIN PAGE: (use the img_refs/orders/main.webp screens on style and elements in the ui)
This web application will have a main page showing menu to the manager there could be categories like: Bebidas, sandwiches, pizzas, there is a search bar to find specific items and a plus button when the manager wants to add an item to a new order, if order exists add to current order if the order does not exist create one and show that window in the right side. When creating the order it should ask for a table number and a name(optional). I will explain more following:
1. Abrir pantalla del menu para añadir items del pedido. Al hacer click en el boton + de un item crea orden. 
2. Crear orden con Nro de mesa, nombre de Cliente (opcional), button (crear).  
3. Confirmar pedido. In case order not confirmed person can still add items o remove them.
4 Los pedidos deben auto clasificarse en los de cocina y los de cafeteria. Los de cocina se imprimen y los de cafe solo se muestran en una pantalla de pedidos donde solo se puede marcar como entregado. Pero el admin debe poder ver todos los pedidos en otra pantalla con mas detalles y opciones de cambio de estado. Tiene que haber un sonido de notificación de pedido nuevo para el barista.

There will be an orders page where: (use the img_refs/orders screens on style and elements in the ui)
4.1 la admin marca como pedido entregado por completo. Pedidos plomos ya estan entregados. Pedidos en naranja estan pendientes. Pedidos pagados desaparecen de pantalla. La lista de pedidos debe solo decir nro pedido, mesa y hora de inicio de pedido. Y de acuerdo a su color poner un boton que diga entregado y vuelve el pedido color plomo. Los pedidos color plomo tienen boton que dice Pagar, archiva el pedido y ya no se muestra en pantalla principal.
5 Cuando se hace click en PAGAR se debe tener una vista de detalle. Debe tener botones para imprimir detalle. Y otro para TERMINAR pedido.
5.1 opción a añadir más cosas a su compra (por si quieres llevar pan o alguna otra cosa)

There will be an HISTORIAL DE PEDIDOS/orders page:
La info archivada debe irse a un historial de pedidos diario, semanal y mensual.
6. Al cerrar orden la info debe ir al historial/reporte donde se contabiliza con hora y fecha.
Adicionar método de pago: que es cash, qr o tarjeta.
La info de reporte se muestra en una tabla con:
Fecha;\tProducto/ Servicio;\tCantidad;\tPrecio Unitario;\tValor Total de la Venta;\tMedio de pago

There will be an MENU LIST page:
There will be an option to modify the menu for the admin. (use img_refs/menu_editing for references on style and elements in the ui). the minimium flow to be completed should be the next:
1 en pantalla debe de haber crear item o añadir nuevo producto (new item)
2 en datos de ítem debe poder ponerse nombre, precio, y a que categoría pertenece, boton de crear
3 en la pantalla donde se ven todos los items del menu debe de haber un boton editar. También debe de haber un boton que diga eliminar item 
No image for items in the menu needed.
edit button opens same window of add menu item and only allows to modify price.
```

---

Round 1 — 2026-08-07

Q: Which order numbering scheme should we use? Choose or describe.
A: Date-prefixed (YYYYMMDD-001)

Q: Which user roles and permissions are required?
A: admin, staff, cook and barista

Q: Confirm order states/transitions. Suggested: pendiente→confirmado→entregado→pagado→archivado.
A: "the suggestion is correct"

Q: Which printing method for kitchen tickets?
A: Network printer (IPP/LPR)

Persisted: Round 1 answers saved to QA log.

