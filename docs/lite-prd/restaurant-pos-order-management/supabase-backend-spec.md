# Supabase Backend Spec — Restaurant POS & Order Management

## Purpose

This spec defines the first backend slice for the POS MVP using Supabase as the source of truth for auth, menu data, orders, order items, payments, reporting, and printer/event queues.

## Design Rules

- Supabase Auth owns identity; the app stores role metadata in `profiles`.
- Use UUID primary keys for all tables.
- Keep money values in `numeric(10,2)`.
- Snapshot menu item name, category, and unit price into order items so history stays stable after menu edits.
- Use row-level security everywhere; the client only sees the data allowed for its role.
- Use RPC functions for multi-step state transitions so the frontend never has to stitch transactional writes together.

## Enums

```sql
create type user_role as enum ('admin', 'staff', 'cook', 'barista');
create type queue_type as enum ('kitchen', 'cafe');
create type order_status as enum ('pendiente', 'confirmado', 'entregado', 'pagado', 'archivado');
create type payment_method as enum ('cash', 'qr', 'card');
create type print_job_status as enum ('queued', 'sent', 'failed');
create type order_item_status as enum ('pending', 'delivered', 'voided');
```

## Tables

### `profiles`

Stores role metadata for each authenticated user.

- `id uuid primary key references auth.users(id) on delete cascade`
- `role user_role not null`
- `full_name text`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `categories`

Menu grouping and queue routing.

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `slug text not null unique`
- `queue_type queue_type not null`
- `sort_order integer not null default 0`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `menu_items`

Admin-managed catalog of sellable items.

- `id uuid primary key default gen_random_uuid()`
- `category_id uuid not null references categories(id)`
- `name text not null`
- `price numeric(10,2) not null check (price >= 0)`
- `active boolean not null default true`
- `sort_order integer not null default 0`
- `created_by uuid references profiles(id)`
- `updated_by uuid references profiles(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `orders`

Top-level order lifecycle.

- `id uuid primary key default gen_random_uuid()`
- `order_number text not null unique`  
  Example: `20260807-001`
- `table_number text not null`
- `customer_name text`
- `status order_status not null default 'pendiente'`
- `payment_method payment_method`
- `subtotal numeric(10,2) not null default 0`
- `total numeric(10,2) not null default 0`
- `created_by uuid references profiles(id)`
- `confirmed_by uuid references profiles(id)`
- `delivered_by uuid references profiles(id)`
- `paid_by uuid references profiles(id)`
- `created_at timestamptz not null default now()`
- `confirmed_at timestamptz`
- `delivered_at timestamptz`
- `paid_at timestamptz`
- `archived_at timestamptz`

### `order_items`

Line items with immutable snapshots.

- `id uuid primary key default gen_random_uuid()`
- `order_id uuid not null references orders(id) on delete cascade`
- `menu_item_id uuid references menu_items(id)`
- `item_name text not null`
- `category_name text not null`
- `queue_type queue_type not null`
- `unit_price numeric(10,2) not null check (unit_price >= 0)`
- `quantity integer not null check (quantity > 0)`
- `line_total numeric(10,2) generated always as (unit_price * quantity) stored`
- `status order_item_status not null default 'pending'`
- `delivered_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `order_payments`

Payment audit trail for closed orders.

- `id uuid primary key default gen_random_uuid()`
- `order_id uuid not null references orders(id) on delete cascade`
- `method payment_method not null`
- `amount numeric(10,2) not null check (amount >= 0)`
- `received_by uuid references profiles(id)`
- `reference text`
- `paid_at timestamptz not null default now()`

### `order_events`

Audit log for state transitions and UI notifications.

- `id uuid primary key default gen_random_uuid()`
- `order_id uuid not null references orders(id) on delete cascade`
- `actor_id uuid references profiles(id)`
- `event_type text not null`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

### `print_jobs`

Queue for kitchen tickets and order-detail prints.

- `id uuid primary key default gen_random_uuid()`
- `order_id uuid not null references orders(id) on delete cascade`
- `job_type text not null`  
  Allowed values: `kitchen_ticket`, `order_detail`, `receipt`
- `status print_job_status not null default 'queued'`
- `target text not null`  
  Example values: `kitchen_printer`, `front_counter`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `sent_at timestamptz`
- `error_message text`

## Views

### `v_order_detail`

Denormalized order header + items for the payment/detail screen.

### `v_open_orders`

Orders with `status in ('pendiente', 'confirmado', 'entregado')` for the main admin list.

### `v_cafe_queue`

Only cafe items that are not delivered yet.

### `v_kitchen_tickets`

Only kitchen items that belong to confirmed orders and have not yet been printed.

### `v_sales_report_line_items`

Historical sales fact table view used for daily, weekly, and monthly exports.

Columns:

- `date`
- `product_or_service`
- `quantity`
- `unit_price`
- `total_sale_value`
- `payment_method`

## RPC Functions

Use these as the app-facing mutation endpoints.

### `create_order`

Creates a new order with the next date-prefixed number.

Input:

- `table_number`
- `customer_name` optional
- `created_by`

Output:

- `order_id`
- `order_number`

### `add_order_item`

Adds a line item to an open order, copying current menu metadata into the snapshot columns.

Input:

- `order_id`
- `menu_item_id`
- `quantity`
- `created_by`

### `update_order_item`

Updates quantity or removes a line item while the order is still editable.

Input:

- `order_item_id`
- `quantity`
- `action` (`update` | `remove`)

### `confirm_order`

Locks an order so it no longer behaves like a draft.

Input:

- `order_id`
- `confirmed_by`

Side effects:

- sets `orders.status = 'confirmado'`
- writes `order_events`
- creates `print_jobs` for kitchen items
- triggers realtime events for barista/cook clients

### `mark_order_delivered`

Marks the full order as delivered and flips the row to gray in the UI.

Input:

- `order_id`
- `delivered_by`

Side effects:

- sets `orders.status = 'entregado'`
- marks cafe line items as delivered when applicable
- writes `order_events`

### `register_payment`

Registers the payment method and closes the order.

Input:

- `order_id`
- `payment_method`
- `received_by`

Side effects:

- inserts `order_payments`
- sets `orders.status = 'pagado'`
- sets `orders.paid_at`
- sets `orders.archived_at`
- writes `order_events`

### `archive_order`

Final archival step if the UI wants to separate payment from archive confirmation.

Input:

- `order_id`
- `archived_by`

## API Surface

Supabase will expose most reads and simple writes through PostgREST. The frontend should rely on the following calls.

### Auth and session

- `GET /auth/v1/user`
- `GET /rest/v1/profiles?select=*&id=eq.<user_id>`

### Menu

- `GET /rest/v1/categories?select=*&active=eq.true&order=sort_order.asc`
- `GET /rest/v1/menu_items?select=*,categories(*)&active=eq.true&order=sort_order.asc`
- `POST /rest/v1/menu_items`
- `PATCH /rest/v1/menu_items?id=eq.<id>`
- `DELETE /rest/v1/menu_items?id=eq.<id>`

### Orders

- `POST /rest/v1/rpc/create_order`
- `POST /rest/v1/rpc/add_order_item`
- `POST /rest/v1/rpc/update_order_item`
- `POST /rest/v1/rpc/confirm_order`
- `POST /rest/v1/rpc/mark_order_delivered`
- `POST /rest/v1/rpc/register_payment`
- `POST /rest/v1/rpc/archive_order`
- `GET /rest/v1/orders?select=*,order_items(*),order_payments(*)&status=in.(pendiente,confirmado,entregado)`
- `GET /rest/v1/orders?select=*,order_items(*),order_payments(*)&status=in.(pagado,archivado)`

### Printing and realtime

- `GET /rest/v1/print_jobs?status=eq.queued&order=created_at.asc`
- `PATCH /rest/v1/print_jobs?id=eq.<id>`
- Subscribe to realtime changes on `orders`, `order_items`, `order_events`, and `print_jobs`.

## RLS Policy Summary

- `admin`: full read/write across menu, orders, payments, reports, and print jobs.
- `staff`: create and manage orders, add items, confirm orders, register payments, and read reports.
- `cook`: read kitchen queue and print jobs, update kitchen print-job status, no menu writes.
- `barista`: read cafe queue and order events, mark cafe items delivered, no menu writes.

Suggested policy boundaries:

- Only `admin` can create, update, or delete `menu_items` and `categories`.
- Only `admin` and `staff` can create or modify draft/open orders.
- Only `admin`, `staff`, and `barista` can mark cafe items delivered.
- Only `cook` and service-role automation can mark kitchen print jobs sent/failed.
- Only `admin` can read archived sales exports if the business wants that restriction; otherwise allow `staff` read-only.

## End-to-End Test Plan

Run the backend through one seeded happy path plus a few negative cases.

### 1. Seed and auth smoke test

- Seed `profiles`, `categories`, and `menu_items`.
- Log in as `staff`, `cook`, `barista`, and `admin`.
- Verify each role can only see the expected rows.

### 2. Order creation flow

- As `staff`, create a new order with table number and optional customer name.
- Add both a kitchen item and a cafe item.
- Confirm the order.
- Assert the order number follows `YYYYMMDD-001` format.
- Assert the kitchen item created a queued `print_jobs` record.
- Assert realtime listeners receive an `order_events` insert.

### 3. Cafe queue flow

- As `barista`, load `v_cafe_queue`.
- Mark the cafe item delivered.
- Assert the item row changes to `delivered` and the order eventually becomes eligible for payment.

### 4. Kitchen print flow

- As the printer worker or service role, claim the queued kitchen print job.
- Mark the job sent.
- Assert the job no longer appears as queued.

### 5. Payment and archive flow

- As `staff`, open the delivered order detail.
- Register payment with `cash`, then repeat with `qr` and `card` in separate isolated cases.
- Assert `order_payments` is inserted.
- Assert `orders.status` becomes `pagado` and `archived_at` is set.
- Assert the order disappears from open-order queries and appears in the archived/report queries.

### 6. Menu admin flow

- As `admin`, create a new menu item.
- Edit only the price.
- Delete the item.
- Assert `staff`, `cook`, and `barista` cannot perform the same writes.

### 7. Reporting flow

- Close at least two orders on different dates and with different payment methods.
- Query `v_sales_report_line_items` by day, week, and month.
- Assert the columns match `Date`, `Product/ Service`, `Quantity`, `Unit Price`, `Total Sale Value`, and `Payment Method`.

### 8. Negative cases

- Attempt to confirm an empty order.
- Attempt to add items to an archived order.
- Attempt to delete a menu item while a draft order still references it.
- Attempt a write with the wrong role and verify RLS blocks it.

## Build Order

1. Create schema, enums, and RLS.
2. Add RPC functions and views.
3. Wire the frontend against the RPCs and realtime channels.
4. Add Playwright E2E coverage for the happy path.
5. Add SQL or integration tests for RLS and reporting.
