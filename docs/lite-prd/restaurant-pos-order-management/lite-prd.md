# Restaurant POS & Order Management — Lite PRD

## Summary

Build a web-based Point of Sale (POS) and order management MVP for a small café that lets staff create and manage orders from a menu, routes items to kitchen vs. café screens, supports basic payment and reporting, and provides an admin view for order details and state changes. Use the project's image references for UI styling: `img_refs/orders/*` and `img_refs/menu_editing/*`.

## Goals
- Deliver a minimal, usable POS flow for creating, confirming, paying, and archiving orders.
- Separate kitchen vs. café order handling (kitchen prints; café shows deliverable-only list).
- Provide an admin orders view with full details and ability to change states.
- Export basic daily/weekly/monthly sales history with payment method breakdown.

## Success Metrics (low-risk inferences)
- Staff can create and confirm an order from the menu within one screen.
- Kitchen staff receive a printed ticket for kitchen items; café staff see new items and can mark them delivered.

## Scope
**In scope:**
- Main menu screen with categorized items, search, and `+` button to add item to an order.
- Order creation: require table number, optional customer name.
- Order confirmation flow: orders can be modified until confirmed.
- Automatic classification of items into `kitchen` and `cafe` queues.
- Kitchen printing for kitchen items; café queue is display-only with an “entregado” action.
- Admin orders view with full detail and state changes (deliver, pay, archive).
- Orders list with color-coded statuses (pending=orange, delivered/archived=gray), buttons (`Entregado`, `Pagar`).
- Payment view with print and `Terminar pedido` actions; support for `cash`, `qr`, and `card` payment methods.
- Order history and reports aggregated by day/week/month with table columns: Date, Product/Service, Quantity, Unit Price, Total, Payment Method.
- Menu management (admin): create, edit (price), and delete items; item fields: name, price, category.

**Out of scope (MVP):**
- Inventory tracking, taxes, discounts, split payments, refunds, or loyalty features.
- Offline-first behavior and sync conflict resolution.
- Complex user/role management beyond basic admin vs. staff distinctions.

## User Personas
- Barista / Café staff: monitors café queue, marks café items as delivered, receives notification sound for new orders.
- Cook / Kitchen staff: receives printed kitchen tickets and processes kitchen items.
- Admin / Manager: sees all orders with details, changes state, edits menu items, views reports.

## User Stories (requirements)
- [ ] As a staff member, I can view the menu with categories (Bebidas, sandwiches, pizzas) and search for items.
- [ ] As a staff member, I can add an item to an existing order or start a new order using the `+` button.
- [ ] As a staff member, when creating a new order I must enter a table number and may enter an optional customer name.
- [ ] As a staff member, I can confirm an order; unconfirmed orders remain editable.
- [ ] As the system, items are auto-classified into `kitchen` or `cafe` queues based on their category/type.
- [ ] As kitchen staff, kitchen items are printed automatically to the kitchen printer.
- [ ] As café staff, café items appear on a display-only orders screen where they can be marked `Entregado`.
- [ ] As a staff member, I can view all orders with full details and change their state (deliver, pay, archive).
- [ ] As a staff member, the orders list shows order number, table, and start time, color-coded by status (orange=pending, gray=delivered/archived).
- [ ] As a staff member, I can mark a pending order as `Entregado`, which toggles its color to gray.
- [ ] As a staff member, delivered (gray) orders have a `Pagar` button that opens the payment/detail view and archives the order after payment.
- [ ] As a staff member, the payment/detail view supports printing the order detail and a `Terminar pedido` action.
- [ ] As a staff member, I can add more items to an order from the payment/detail screen.
- [ ] As an admin, I can access an orders history view aggregated by day/week/month with the specified report columns.
- [ ] As an admin, I can create, edit (price only), and delete menu items; new item form includes name, price, and category.
- [ ] As a system, new orders trigger a notification sound for baristas/kitchen staff.

## UX / Flows
- Main page: categorized menu, search bar, `+` button on items. Clicking `+` adds to current open order or opens a new order modal (table number + optional name) shown on the right side.
- Order lifecycle: create → (edit if unconfirmed) → confirm → kitchen/café queues → mark delivered → payment → archive to history.
- Orders page: compact list showing `#`, table, start time; each row color indicates status and contains `Entregado` or `Pagar` action as appropriate.
- Payment/detail view: shows full itemized list, print button(s), `Terminar pedido`, and option to add more items.
- Menu List: admin screen showing all menu items with `Editar` and `Eliminar` actions; `Editar` opens the same add-item modal but only allows price edits.

## Data & Reporting
- Store order metadata: order id, table number, optional customer name, line items (product, qty, unit price), classification (kitchen/cafe), timestamps (created, confirmed, delivered, paid), payment method.
- Reporting view: daily/weekly/monthly aggregation with columns: Date, Product/Service, Quantity, Unit Price, Total Sale Value, Payment Method.

## Notifications & Hardware Integration (as specified)
- Play a notification sound for new orders intended for barista/kitchen.
- Kitchen items must be printed automatically to a kitchen printer (integration details TBD).

## Implementation Notes
- Use `img_refs/orders/*` for main UI and `img_refs/menu_editing/*` for menu admin styling.
- Color conventions: orange = pending, gray = delivered/archived (as described in the source).
- Supabase is the backend source of truth; see [supabase-backend-spec.md](supabase-backend-spec.md) for the database schema, RPC endpoints, RLS rules, and end-to-end test plan.

## Clarifications
1. Order identifiers: Date-prefixed (YYYYMMDD-001)
2. Authentication & roles: `admin`, `staff`, `cook`, and `barista` — resolved (permissions to be defined per role in implementation).
3. Kitchen printing: Network printer (IPP/LPR) — resolved (use network-capable kitchen printers).
4. Receipt format and whether printing is required for customer receipts or only kitchen tickets.
5. Exact state machine & labels: confirmed: `pendiente` → `confirmado` → `entregado` → `pagado` → `archivado`.
6. Not supported payment edge cases: split payments, refunds, and partial payments.
7. Taxes, discounts, or additional line-level modifiers—not required
8. Reports: required export formats (CSV)
9. Offline or intermittent connectivity behavior and expected guarantees. Not supported on MVP.
10. Languages/localization (default language is Spanish).

---

Files produced:
- `docs/lite-prd/restaurant-pos-order-management/qa-log.md` (seeded from `mvp.md`)
- `docs/lite-prd/restaurant-pos-order-management/lite-prd.md` (this file)
