create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('admin', 'staff', 'cook', 'barista');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.queue_type as enum ('kitchen', 'cafe');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_status as enum ('pendiente', 'confirmado', 'entregado', 'pagado', 'archivado');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum ('cash', 'qr', 'card');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.print_job_status as enum ('queued', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_item_status as enum ('pending', 'delivered', 'voided');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key,
  role public.user_role not null,
  full_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  queue_type public.queue_type not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  table_number text not null,
  customer_name text,
  status public.order_status not null default 'pendiente',
  payment_method public.payment_method,
  subtotal numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  created_by uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  delivered_by uuid references public.profiles(id),
  paid_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  delivered_at timestamptz,
  paid_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id),
  item_name text not null,
  category_name text not null,
  queue_type public.queue_type not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) generated always as (unit_price * quantity) stored,
  status public.order_item_status not null default 'pending',
  printed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(10,2) not null check (amount >= 0),
  received_by uuid references public.profiles(id),
  reference text,
  paid_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  job_type text not null,
  status public.print_job_status not null default 'queued',
  target text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error_message text
);

create table if not exists public.order_daily_counters (
  counter_date date primary key,
  next_sequence integer not null default 1
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.has_role(allowed_roles public.user_role[])
returns boolean
language sql
stable
as $$
  select coalesce((select public.current_app_role() = any (allowed_roles)), false)
$$;

create or replace function public.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set subtotal = coalesce((select sum(line_total) from public.order_items where order_id = p_order_id), 0),
      total = coalesce((select sum(line_total) from public.order_items where order_id = p_order_id), 0)
  where id = p_order_id;
end;
$$;

create or replace function public.sync_order_totals()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);
  perform public.recalculate_order_totals(v_order_id);
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.create_order(
  p_table_number text,
  p_customer_name text default null,
  p_created_by uuid default auth.uid()
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_sequence integer;
  v_date date := current_date;
begin
  if p_table_number is null or btrim(p_table_number) = '' then
    raise exception 'table_number is required';
  end if;

  insert into public.order_daily_counters (counter_date, next_sequence)
  values (v_date, 2)
  on conflict (counter_date)
  do update set next_sequence = public.order_daily_counters.next_sequence + 1
  returning next_sequence - 1 into v_sequence;

  v_order_number := to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_sequence::text, 3, '0');

  insert into public.orders (order_number, table_number, customer_name, status, created_by)
  values (v_order_number, p_table_number, p_customer_name, 'pendiente', p_created_by)
  returning id into v_order_id;

  return query select v_order_id, v_order_number;
end;
$$;

create or replace function public.add_order_item(
  p_order_id uuid,
  p_menu_item_id uuid,
  p_quantity integer,
  p_created_by uuid default auth.uid()
)
returns table(order_item_id uuid, order_status public.order_status, queue_type public.queue_type)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_name text;
  v_queue_type public.queue_type;
  v_item_name text;
  v_unit_price numeric(10,2);
  v_order_status public.order_status;
  v_order_item_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than 0';
  end if;

  select o.status into v_order_status
  from public.orders o
  where o.id = p_order_id;

  if v_order_status in ('pagado', 'archivado') then
    raise exception 'order is closed';
  end if;

  select c.name, c.queue_type, mi.name, mi.price
  into v_category_name, v_queue_type, v_item_name, v_unit_price
  from public.menu_items mi
  join public.categories c on c.id = mi.category_id
  where mi.id = p_menu_item_id
    and mi.active = true
    and c.active = true;

  if v_item_name is null then
    raise exception 'menu item not found';
  end if;

  insert into public.order_items (
    order_id,
    menu_item_id,
    item_name,
    category_name,
    queue_type,
    unit_price,
    quantity
  )
  values (
    p_order_id,
    p_menu_item_id,
    v_item_name,
    v_category_name,
    v_queue_type,
    v_unit_price,
    p_quantity
  )
  returning id into v_order_item_id;

  if v_order_status = 'entregado' then
    update public.orders
    set status = 'confirmado',
        delivered_at = null,
        delivered_by = null
    where id = p_order_id;
  end if;

  select status into v_order_status
  from public.orders
  where id = p_order_id;

  perform public.recalculate_order_totals(p_order_id);

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (
    p_order_id,
    p_created_by,
    'order_item_added',
    jsonb_build_object('order_item_id', v_order_item_id, 'quantity', p_quantity, 'queue_type', v_queue_type)
  );

  return query select v_order_item_id, v_order_status, v_queue_type;
end;
$$;

create or replace function public.update_order_item(
  p_order_item_id uuid,
  p_quantity integer default null,
  p_action text default 'update',
  p_actor_id uuid default auth.uid()
)
returns table(order_id uuid, order_item_id uuid, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  select oi.order_id into v_order_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
    and o.status not in ('pagado', 'archivado');

  if v_order_id is null then
    raise exception 'order item not editable';
  end if;

  if p_action = 'remove' then
    delete from public.order_items where id = p_order_item_id;
  else
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'quantity must be greater than 0';
    end if;

    update public.order_items
    set quantity = p_quantity
    where id = p_order_item_id;
  end if;

  perform public.recalculate_order_totals(v_order_id);

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (
    v_order_id,
    p_actor_id,
    'order_item_updated',
    jsonb_build_object('order_item_id', p_order_item_id, 'action', p_action)
  );

  return query select v_order_id, p_order_item_id, p_action;
end;
$$;

create or replace function public.confirm_order(
  p_order_id uuid,
  p_confirmed_by uuid default auth.uid()
)
returns table(order_id uuid, status public.order_status, print_job_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status public.order_status;
  v_print_job_id uuid;
  v_kitchen_items jsonb;
begin
  select o.status into v_order_status
  from public.orders as o
  where o.id = p_order_id;

  if v_order_status is null then
    raise exception 'order not found';
  end if;

  if not exists (select 1 from public.order_items as oi where oi.order_id = p_order_id) then
    raise exception 'order has no items';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_item_id', oi.id,
    'item_name', oi.item_name,
    'quantity', oi.quantity,
    'unit_price', oi.unit_price,
    'line_total', oi.line_total
  )), '[]'::jsonb)
  into v_kitchen_items
  from public.order_items oi
  where oi.order_id = p_order_id
    and oi.queue_type = 'kitchen'
    and oi.printed_at is null;

  update public.orders as o
  set status = 'confirmado',
      confirmed_at = coalesce(confirmed_at, now()),
      confirmed_by = coalesce(p_confirmed_by, confirmed_by)
  where o.id = p_order_id;

  if jsonb_array_length(v_kitchen_items) > 0 then
    insert into public.print_jobs (order_id, job_type, status, target, payload)
    values (
      p_order_id,
      'kitchen_ticket',
      'queued',
      'kitchen_printer',
      jsonb_build_object('items', v_kitchen_items)
    )
    returning id into v_print_job_id;

    update public.order_items as oi
    set printed_at = now()
    where oi.order_id = p_order_id
      and oi.queue_type = 'kitchen'
      and oi.printed_at is null;
  end if;

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (
    p_order_id,
    p_confirmed_by,
    'order_confirmed',
    jsonb_build_object('print_job_id', v_print_job_id)
  );

  return query select p_order_id, 'confirmado'::public.order_status, v_print_job_id;
end;
$$;

create or replace function public.mark_order_item_delivered(
  p_order_item_id uuid,
  p_delivered_by uuid default auth.uid()
)
returns table(order_id uuid, order_item_id uuid, status public.order_item_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_queue_type public.queue_type;
begin
  select oi.order_id, oi.queue_type into v_order_id, v_queue_type
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
    and o.status not in ('pagado', 'archivado');

  if v_order_id is null then
    raise exception 'order item not found or not deliverable';
  end if;

  if v_queue_type <> 'cafe' then
    raise exception 'only cafe items can be delivered from the cafe queue';
  end if;

  update public.order_items
  set status = 'delivered',
      delivered_at = now()
  where id = p_order_item_id;

  if not exists (
    select 1
    from public.order_items as oi
    where oi.order_id = v_order_id
      and oi.status <> 'delivered'
  ) then
    update public.orders as o
    set status = 'entregado',
        delivered_at = now(),
        delivered_by = coalesce(p_delivered_by, delivered_by)
    where o.id = v_order_id;
  end if;

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (
    v_order_id,
    p_delivered_by,
    'order_item_delivered',
    jsonb_build_object('order_item_id', p_order_item_id, 'queue_type', v_queue_type)
  );

  return query select v_order_id, p_order_item_id, 'delivered'::public.order_item_status;
end;
$$;

create or replace function public.mark_order_delivered(
  p_order_id uuid,
  p_delivered_by uuid default auth.uid()
)
returns table(order_id uuid, status public.order_status)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.order_items as oi
  set status = 'delivered',
      delivered_at = coalesce(delivered_at, now())
  where oi.order_id = p_order_id
    and oi.status <> 'delivered';

  update public.orders as o
  set status = 'entregado',
      delivered_at = now(),
      delivered_by = coalesce(p_delivered_by, delivered_by)
  where o.id = p_order_id;

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (
    p_order_id,
    p_delivered_by,
    'order_delivered',
    '{}'::jsonb
  );

  return query select p_order_id, 'entregado'::public.order_status;
end;
$$;

create or replace function public.register_payment(
  p_order_id uuid,
  p_payment_method public.payment_method,
  p_received_by uuid default auth.uid(),
  p_reference text default null
)
returns table(payment_id uuid, order_id uuid, status public.order_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_total numeric(10,2);
begin
  select o.total into v_total
  from public.orders as o
  where o.id = p_order_id
    and o.status = 'entregado';

  if v_total is null then
    raise exception 'order must be delivered before payment';
  end if;

  insert into public.order_payments (order_id, method, amount, received_by, reference)
  values (p_order_id, p_payment_method, v_total, p_received_by, p_reference)
  returning id into v_payment_id;

  update public.orders as o
  set status = 'pagado',
      payment_method = p_payment_method,
      paid_at = now(),
      paid_by = coalesce(p_received_by, paid_by)
  where o.id = p_order_id;

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (
    p_order_id,
    p_received_by,
    'order_paid',
    jsonb_build_object('payment_id', v_payment_id, 'payment_method', p_payment_method)
  );

  return query select v_payment_id, p_order_id, 'pagado'::public.order_status;
end;
$$;

create or replace function public.archive_order(
  p_order_id uuid,
  p_archived_by uuid default auth.uid()
)
returns table(order_id uuid, status public.order_status)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders as o
  set status = 'archivado',
      archived_at = now()
  where o.id = p_order_id
    and o.status in ('pagado', 'entregado');

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (
    p_order_id,
    p_archived_by,
    'order_archived',
    '{}'::jsonb
  );

  return query select p_order_id, 'archivado'::public.order_status;
end;
$$;

create or replace view public.v_open_orders as
select
  o.id,
  o.order_number,
  o.table_number,
  o.customer_name,
  o.status,
  o.created_at,
  o.confirmed_at,
  o.delivered_at,
  o.paid_at,
  count(oi.id) as item_count,
  sum(oi.line_total) as total
from public.orders o
left join public.order_items oi on oi.order_id = o.id
where o.status in ('pendiente', 'confirmado', 'entregado')
group by o.id;

create or replace view public.v_cafe_queue as
select
  o.id as order_id,
  o.order_number,
  o.table_number,
  o.customer_name,
  o.status as order_status,
  oi.id as order_item_id,
  oi.item_name,
  oi.quantity,
  oi.unit_price,
  oi.line_total,
  oi.status as item_status,
  oi.created_at
from public.order_items oi
join public.orders o on o.id = oi.order_id
where oi.queue_type = 'cafe'
  and oi.status = 'pending'
  and o.status in ('pendiente', 'confirmado', 'entregado');

create or replace view public.v_kitchen_tickets as
select
  o.id as order_id,
  o.order_number,
  o.table_number,
  o.customer_name,
  o.status as order_status,
  oi.id as order_item_id,
  oi.item_name,
  oi.quantity,
  oi.unit_price,
  oi.line_total,
  oi.printed_at,
  oi.created_at
from public.order_items oi
join public.orders o on o.id = oi.order_id
where oi.queue_type = 'kitchen'
  and o.status in ('pendiente', 'confirmado', 'entregado');

create or replace view public.v_order_detail as
select
  o.id,
  o.order_number,
  o.table_number,
  o.customer_name,
  o.status,
  o.payment_method,
  o.subtotal,
  o.total,
  o.created_at,
  o.confirmed_at,
  o.delivered_at,
  o.paid_at,
  o.archived_at,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'item_name', oi.item_name,
        'category_name', oi.category_name,
        'queue_type', oi.queue_type,
        'unit_price', oi.unit_price,
        'quantity', oi.quantity,
        'line_total', oi.line_total,
        'status', oi.status,
        'printed_at', oi.printed_at,
        'delivered_at', oi.delivered_at
      )
      order by oi.created_at
    ) filter (where oi.id is not null),
    '[]'::jsonb
  ) as items
from public.orders o
left join public.order_items oi on oi.order_id = o.id
group by o.id;

create or replace view public.v_sales_report_line_items as
select
  date_trunc('day', coalesce(o.paid_at, o.archived_at, o.created_at))::date as date,
  oi.item_name as product_or_service,
  oi.quantity,
  oi.unit_price,
  oi.line_total as total_sale_value,
  op.method as payment_method,
  o.order_number,
  o.status
from public.orders o
join public.order_items oi on oi.order_id = o.id
left join public.order_payments op on op.order_id = o.id
where o.status in ('pagado', 'archivado');

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_events enable row level security;
alter table public.print_jobs enable row level security;

create policy profiles_select_self_or_admin on public.profiles
for select
using (id = auth.uid() or public.has_role(array['admin']::public.user_role[]));

create policy profiles_update_self_or_admin on public.profiles
for update
using (id = auth.uid() or public.has_role(array['admin']::public.user_role[]))
with check (id = auth.uid() or public.has_role(array['admin']::public.user_role[]));

create policy categories_select_authenticated on public.categories
for select
using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));

create policy categories_write_admin on public.categories
for all
using (public.has_role(array['admin']::public.user_role[]))
with check (public.has_role(array['admin']::public.user_role[]));

create policy menu_items_select_authenticated on public.menu_items
for select
using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));

create policy menu_items_write_admin on public.menu_items
for all
using (public.has_role(array['admin']::public.user_role[]))
with check (public.has_role(array['admin']::public.user_role[]));

create policy orders_select_authenticated on public.orders
for select
using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));

create policy orders_write_staff_admin on public.orders
for insert
with check (public.has_role(array['admin','staff']::public.user_role[]));

create policy orders_update_staff_admin on public.orders
for update
using (public.has_role(array['admin','staff']::public.user_role[]))
with check (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_items_select_authenticated on public.order_items
for select
using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));

create policy order_items_write_staff_admin on public.order_items
for insert
with check (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_items_update_staff_admin on public.order_items
for update
using (public.has_role(array['admin','staff']::public.user_role[]))
with check (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_items_delete_staff_admin on public.order_items
for delete
using (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_payments_select_staff_admin on public.order_payments
for select
using (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_payments_write_staff_admin on public.order_payments
for insert
with check (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_events_select_authenticated on public.order_events
for select
using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));

create policy order_events_write_authenticated on public.order_events
for insert
with check (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));

create policy print_jobs_select_cook_admin on public.print_jobs
for select
using (public.has_role(array['admin','cook','staff']::public.user_role[]));

create policy print_jobs_write_cook_admin on public.print_jobs
for all
using (public.has_role(array['admin','cook']::public.user_role[]))
with check (public.has_role(array['admin','cook']::public.user_role[]));

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger set_categories_updated_at
before update on public.categories
for each row execute function public.touch_updated_at();

create trigger set_menu_items_updated_at
before update on public.menu_items
for each row execute function public.touch_updated_at();

create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create trigger set_order_items_updated_at
before update on public.order_items
for each row execute function public.touch_updated_at();

create trigger recalc_order_totals_after_insert
after insert on public.order_items
for each row execute function public.sync_order_totals();

create trigger recalc_order_totals_after_update
after update on public.order_items
for each row execute function public.sync_order_totals();

create trigger recalc_order_totals_after_delete
after delete on public.order_items
for each row execute function public.sync_order_totals();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.order_payments to authenticated;
grant select, insert, update, delete on public.order_events to authenticated;
grant select, insert, update, delete on public.print_jobs to authenticated;
grant select on public.v_open_orders to authenticated;
grant select on public.v_cafe_queue to authenticated;
grant select on public.v_kitchen_tickets to authenticated;
grant select on public.v_order_detail to authenticated;
grant select on public.v_sales_report_line_items to authenticated;

grant execute on function public.create_order(text, text, uuid) to authenticated;
grant execute on function public.add_order_item(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.update_order_item(uuid, integer, text, uuid) to authenticated;
grant execute on function public.confirm_order(uuid, uuid) to authenticated;
grant execute on function public.mark_order_item_delivered(uuid, uuid) to authenticated;
grant execute on function public.mark_order_delivered(uuid, uuid) to authenticated;
grant execute on function public.register_payment(uuid, public.payment_method, uuid, text) to authenticated;
grant execute on function public.archive_order(uuid, uuid) to authenticated;
