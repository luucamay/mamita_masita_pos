-- P01. Prepared locally; do not apply to the shared project until recovery is ready.
-- Historical prices, totals and status are not rewritten.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

do $$
begin
  if exists (select 1 from public.order_payments group by order_id having count(*) > 1) then
    raise exception 'P01 preflight: duplicate payments require review';
  end if;
  if exists (select 1 from public.orders where subtotal <> total) then
    raise exception 'P01 preflight: legacy totals require review';
  end if;
end $$;

alter table public.orders
  add column discount_bps integer not null default 0 check (discount_bps between 0 and 10000),
  add column discount_amount numeric(10,2) not null default 0,
  add column purchase_type text not null default 'customer' check (purchase_type in ('customer','employee')),
  add column buyer_employee_id uuid references public.profiles(id),
  add constraint orders_discount_amount_check check (
    discount_amount = round(subtotal * discount_bps / 10000, 2)
    and total = subtotal - discount_amount and total >= 0
  ),
  add constraint orders_buyer_check check (
    (purchase_type = 'customer' and buyer_employee_id is null)
    or (purchase_type = 'employee' and buyer_employee_id is not null and discount_bps = 2000)
  );
alter table public.order_items
  add column discount_amount numeric(10,2) not null default 0
    check (discount_amount >= 0 and discount_amount <= unit_price * quantity),
  add column net_total numeric(10,2) generated always as (
    case when status = 'voided' then 0 else unit_price * quantity - discount_amount end
  ) stored;
alter table public.menu_items add constraint menu_items_finite_price check (price <> 'NaN'::numeric);
alter table public.order_items add constraint order_items_finite_price check (unit_price <> 'NaN'::numeric);
create unique index order_payments_one_per_order_idx on public.order_payments(order_id);

create or replace function public.stamp_menu_actor()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;
revoke all on function public.stamp_menu_actor() from public,anon,authenticated;
create trigger stamp_menu_actor before insert or update on public.menu_items
  for each row execute function public.stamp_menu_actor();

create or replace function private.current_app_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active
$$;
revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

create or replace function public.current_app_role()
returns public.user_role language sql stable security invoker set search_path = '' as $$
  select private.current_app_role()
$$;
create or replace function public.has_role(allowed_roles public.user_role[])
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(public.current_app_role() = any(allowed_roles), false)
$$;

create or replace function private.assert_actor(allowed_roles public.user_role[], actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or actor is distinct from uid
     or not coalesce(private.current_app_role() = any(allowed_roles), false) then
    raise exception using errcode = '42501', message = 'Acceso no autorizado';
  end if;
  return uid;
end $$;

create or replace function private.lock_order(id uuid)
returns public.orders language plpgsql security invoker set search_path = '' as $$
declare row public.orders;
begin
  select o.* into row from public.orders o where o.id = $1 for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  return row;
end $$;

-- Internal only. All mutators lock the parent order BEFORE touching its lines/payments.
create or replace function private.recalculate_order_totals(p_order_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare row public.orders; gross numeric; target numeric;
begin
  row := private.lock_order(p_order_id);
  if row.status in ('pagado','archivado') then raise exception 'Pedido cerrado'; end if;
  select coalesce(sum(oi.line_total),0) into gross
    from public.order_items oi where oi.order_id = p_order_id and oi.status <> 'voided';
  target := round(gross * row.discount_bps / 10000, 2) * 100;
  with weights as (
    select oi.id, case when gross = 0 then 0 else oi.line_total * target / gross end as exact
    from public.order_items oi where oi.order_id = p_order_id and oi.status <> 'voided'
  ), ranked as (
    select id, floor(exact) as base,
      row_number() over(order by exact - floor(exact) desc, id) as rank,
      sum(floor(exact)) over() as allocated
    from weights
  ), amounts as (
    select id, (base + case when rank <= target - allocated then 1 else 0 end) / 100 as amount from ranked
    union all select oi.id, 0 from public.order_items oi where oi.order_id = p_order_id and oi.status = 'voided'
  )
  update public.order_items oi set discount_amount = a.amount
    from amounts a where oi.id = a.id and oi.discount_amount is distinct from a.amount;
  update public.orders set subtotal = gross, discount_amount = target / 100,
    total = gross - target / 100 where id = p_order_id;
end $$;

-- Keep the old signature for dependent triggers, but remove API execution.
create or replace function public.recalculate_order_totals(p_order_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.recalculate_order_totals(p_order_id)
$$;
create or replace function public.sync_order_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id then
    raise exception 'No se permite mover una línea de pedido';
  end if;
  perform private.recalculate_order_totals(case when tg_op = 'DELETE' then old.order_id else new.order_id end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists recalc_order_totals_after_update on public.order_items;
create trigger recalc_order_totals_after_update
  after update of unit_price, quantity, status, order_id on public.order_items
  for each row execute function public.sync_order_totals();

create or replace function private.create_order(
  p_table_number text, p_customer_name text default null, p_created_by uuid default auth.uid()
) returns table(order_id uuid, order_number text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; id uuid; number text; seq integer; day date := (now() at time zone 'America/La_Paz')::date;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[], p_created_by);
  if nullif(btrim(p_table_number),'') is null then raise exception 'La mesa es obligatoria'; end if;
  insert into public.order_daily_counters(counter_date,next_sequence) values(day,2)
    on conflict(counter_date) do update set next_sequence = public.order_daily_counters.next_sequence + 1
    returning next_sequence - 1 into seq;
  number := to_char(day,'YYYYMMDD') || '-' || lpad(seq::text, greatest(3,length(seq::text)), '0');
  insert into public.orders(order_number,table_number,customer_name,created_by)
    values(number,btrim(p_table_number),nullif(btrim(p_customer_name),''),uid) returning public.orders.id into id;
  return query select id, number;
end $$;

create or replace function private.add_order_item(
  p_order_id uuid, p_menu_item_id uuid, p_quantity integer, p_created_by uuid default auth.uid()
) returns table(order_item_id uuid, order_status public.order_status, queue_type public.queue_type)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; row public.orders; item record; id uuid;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[], p_created_by);
  row := private.lock_order(p_order_id);
  if row.status in ('pagado','archivado') then raise exception 'Pedido cerrado'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Cantidad inválida'; end if;
  select mi.name,mi.price,c.name as category,c.queue_type into item
    from public.menu_items mi join public.categories c on c.id = mi.category_id
    where mi.id = p_menu_item_id and mi.active and c.active;
  if not found then raise exception 'Producto no disponible'; end if;
  insert into public.order_items(order_id,menu_item_id,item_name,category_name,queue_type,unit_price,quantity)
    values(p_order_id,p_menu_item_id,item.name,item.category,item.queue_type,item.price,p_quantity)
    returning public.order_items.id into id;
  if row.status = 'entregado' then
    update public.orders set status = 'confirmado',delivered_at = null,delivered_by = null where public.orders.id = p_order_id;
    row.status := 'confirmado';
  end if;
  insert into public.order_events(order_id,actor_id,event_type,payload)
    values(p_order_id,uid,'order_item_added',jsonb_build_object('order_item_id',id,'quantity',p_quantity));
  return query select id,row.status,item.queue_type;
end $$;

create or replace function private.update_order_item(
  p_order_item_id uuid, p_quantity integer default null, p_action text default 'update', p_actor_id uuid default auth.uid()
) returns table(order_id uuid, order_item_id uuid, action text)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; parent uuid; row public.orders; line public.order_items;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[], p_actor_id);
  select oi.order_id into parent from public.order_items oi where oi.id = p_order_item_id;
  row := private.lock_order(parent);
  select * into line from public.order_items oi where oi.id = p_order_item_id;
  if row.status in ('pagado','archivado') or line.status is distinct from 'pending'::public.order_item_status then
    raise exception 'Solo se pueden cambiar productos pendientes de un pedido abierto';
  end if;
  if p_action is null or p_action not in ('update','remove') then raise exception 'Acción inválida'; end if;
  if p_action = 'remove' then
    update public.order_items set status = 'voided' where id = p_order_item_id;
  else
    if p_quantity is null or p_quantity <= 0 then raise exception 'Cantidad inválida'; end if;
    -- Clear the old allocation before reducing quantity; the AFTER trigger redistributes it.
    update public.order_items set quantity = p_quantity,discount_amount = 0 where id = p_order_item_id;
  end if;
  insert into public.order_events(order_id,actor_id,event_type,payload)
    values(parent,uid,'order_item_updated',jsonb_build_object('order_item_id',p_order_item_id,'action',p_action,'previous_quantity',line.quantity,'quantity',p_quantity));
  return query select parent,p_order_item_id,p_action;
end $$;

create or replace function private.confirm_order(p_order_id uuid,p_confirmed_by uuid default auth.uid())
returns table(order_id uuid,status public.order_status,print_job_id uuid)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; row public.orders; items jsonb; job uuid;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[],p_confirmed_by);
  row := private.lock_order(p_order_id);
  if row.status not in ('pendiente','confirmado') then raise exception 'El pedido no se puede confirmar'; end if;
  if not exists(select 1 from public.order_items oi where oi.order_id = p_order_id and oi.status <> 'voided') then
    raise exception 'El pedido no tiene productos';
  end if;
  select jsonb_agg(jsonb_build_object('order_item_id',oi.id,'item_name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total))
    into items from public.order_items oi
    where oi.order_id = p_order_id and oi.queue_type = 'kitchen' and oi.status = 'pending' and oi.printed_at is null;
  if items is not null then
    insert into public.print_jobs(order_id,job_type,target,payload)
      values(p_order_id,'kitchen_ticket','kitchen_printer',jsonb_build_object('items',items)) returning id into job;
    update public.order_items oi set printed_at = now()
      where oi.order_id = p_order_id and oi.queue_type = 'kitchen' and oi.status = 'pending' and oi.printed_at is null;
  end if;
  update public.orders set status = 'confirmado',confirmed_at = coalesce(confirmed_at,now()),confirmed_by = coalesce(confirmed_by,uid)
    where id = p_order_id;
  if row.status = 'pendiente' or job is not null then
    insert into public.order_events(order_id,actor_id,event_type,payload)
      values(p_order_id,uid,'order_confirmed',jsonb_build_object('print_job_id',job));
  end if;
  return query select p_order_id,'confirmado'::public.order_status,job;
end $$;

create or replace function private.create_order_with_items(p_table_number text,p_customer_name text,p_created_by uuid,p_items jsonb)
returns table(order_id uuid,order_number text)
language plpgsql security definer set search_path = '' as $$
declare id uuid; number text; item jsonb;
begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],p_created_by);
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'El pedido requiere productos'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'El pedido requiere productos'; end if;
  select c.order_id,c.order_number into id,number from private.create_order(p_table_number,p_customer_name,p_created_by) c;
  for item in select value from jsonb_array_elements(p_items) loop
    -- Reject fractional quantities instead of silently rounding a numeric cast.
    if coalesce(item->>'quantity','') !~ '^[1-9][0-9]*$' then raise exception 'Cantidad inválida'; end if;
    perform private.add_order_item(id,(item->>'menu_item_id')::uuid,(item->>'quantity')::integer,p_created_by);
  end loop;
  perform private.confirm_order(id,p_created_by);
  return query select id,number;
end $$;

create or replace function private.deliver_item(p_order_item_id uuid,p_queue public.queue_type,p_delivered_by uuid)
returns table(order_id uuid,order_item_id uuid,status public.order_item_status)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; parent uuid; row public.orders; line public.order_items; roles public.user_role[];
begin
  roles := case when p_queue = 'cafe' then array['admin','staff','barista']::public.user_role[] else array['admin','staff','cook']::public.user_role[] end;
  uid := private.assert_actor(roles,p_delivered_by);
  select oi.order_id into parent from public.order_items oi where oi.id = p_order_item_id;
  row := private.lock_order(parent);
  select * into line from public.order_items oi where oi.id = p_order_item_id;
  if row.status not in ('confirmado','entregado') or line.queue_type is distinct from p_queue or line.status = 'voided' then
    raise exception 'Producto no entregable en esta cola';
  end if;
  if line.status = 'delivered' then return query select parent,p_order_item_id,'delivered'::public.order_item_status; return; end if;
  update public.order_items set status = 'delivered',delivered_at = now() where id = p_order_item_id;
  if not exists(select 1 from public.order_items oi where oi.order_id = parent and oi.status = 'pending') then
    update public.orders set status = 'entregado',delivered_at = now(),delivered_by = uid where id = parent;
  end if;
  insert into public.order_events(order_id,actor_id,event_type,payload)
    values(parent,uid,'order_item_delivered',jsonb_build_object('order_item_id',p_order_item_id,'queue_type',p_queue));
  return query select parent,p_order_item_id,'delivered'::public.order_item_status;
end $$;

create or replace function private.mark_order_item_delivered(p_order_item_id uuid,p_delivered_by uuid default auth.uid())
returns table(order_id uuid,order_item_id uuid,status public.order_item_status)
language sql security invoker set search_path = '' as $$
  select * from private.deliver_item(p_order_item_id,'cafe',p_delivered_by)
$$;
create or replace function private.mark_kitchen_item_delivered(p_order_item_id uuid,p_delivered_by uuid default auth.uid())
returns table(order_id uuid,order_item_id uuid,status public.order_item_status)
language sql security invoker set search_path = '' as $$
  select * from private.deliver_item(p_order_item_id,'kitchen',p_delivered_by)
$$;
create or replace function private.mark_order_delivered(p_order_id uuid,p_delivered_by uuid default auth.uid())
returns table(order_id uuid,status public.order_status)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; row public.orders;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[],p_delivered_by);
  row := private.lock_order(p_order_id);
  if row.status not in ('confirmado','entregado') then raise exception 'El pedido no se puede entregar'; end if;
  if not exists(select 1 from public.order_items oi where oi.order_id = p_order_id and oi.status <> 'voided') then raise exception 'El pedido no tiene productos'; end if;
  if row.status = 'entregado' then return query select p_order_id,row.status; return; end if;
  update public.order_items oi set status = 'delivered',delivered_at = coalesce(delivered_at,now())
    where oi.order_id = p_order_id and oi.status = 'pending';
  update public.orders set status = 'entregado',delivered_at = now(),delivered_by = uid where id = p_order_id;
  insert into public.order_events(order_id,actor_id,event_type) values(p_order_id,uid,'order_delivered');
  return query select p_order_id,'entregado'::public.order_status;
end $$;

create or replace function private.register_payment(
  p_order_id uuid,p_payment_method public.payment_method,p_received_by uuid default auth.uid(),p_reference text default null
) returns table(payment_id uuid,order_id uuid,status public.order_status)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; row public.orders; payment public.order_payments; id uuid;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[],p_received_by);
  row := private.lock_order(p_order_id);
  if p_payment_method is null then raise exception 'El medio de pago es obligatorio'; end if;
  select * into payment from public.order_payments op where op.order_id = p_order_id;
  if found then
    if row.status not in ('pagado','archivado') or payment.method <> p_payment_method
       or payment.amount <> row.total or payment.reference is distinct from p_reference then
      raise exception 'El pedido ya tiene un pago diferente';
    end if;
    return query select payment.id,p_order_id,row.status; return;
  end if;
  if row.status <> 'entregado' then raise exception 'El pedido debe entregarse antes de cobrar'; end if;
  if not exists(select 1 from public.order_items oi where oi.order_id = p_order_id and oi.status <> 'voided') then raise exception 'El pedido no tiene productos'; end if;
  perform private.recalculate_order_totals(p_order_id);
  select o.* into row from public.orders o where o.id = p_order_id;
  insert into public.order_payments(order_id,method,amount,received_by,reference)
    values(p_order_id,p_payment_method,row.total,uid,p_reference) returning public.order_payments.id into id;
  update public.orders set status = 'pagado',payment_method = p_payment_method,paid_at = now(),paid_by = uid where public.orders.id = p_order_id;
  insert into public.order_events(order_id,actor_id,event_type,payload)
    values(p_order_id,uid,'order_paid',jsonb_build_object('payment_id',id,'payment_method',p_payment_method));
  return query select id,p_order_id,'pagado'::public.order_status;
end $$;

create or replace function private.archive_order(p_order_id uuid,p_archived_by uuid default auth.uid())
returns table(order_id uuid,status public.order_status)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; row public.orders;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[],p_archived_by);
  row := private.lock_order(p_order_id);
  if row.status not in ('pagado','archivado') or not exists(
    select 1 from public.order_payments op where op.order_id = p_order_id and op.amount = row.total and op.method = row.payment_method
  ) then raise exception 'El pedido requiere un pago válido antes de archivarse'; end if;
  if row.status = 'archivado' then return query select p_order_id,row.status; return; end if;
  update public.orders set status = 'archivado',archived_at = now() where id = p_order_id;
  insert into public.order_events(order_id,actor_id,event_type) values(p_order_id,uid,'order_archived');
  return query select p_order_id,'archivado'::public.order_status;
end $$;

create or replace function private.checkout_order(
  p_order_id uuid,p_payment_method public.payment_method,p_received_by uuid default auth.uid(),p_reference text default null
) returns table(payment_id uuid,order_id uuid,status public.order_status)
language plpgsql security definer set search_path = '' as $$
declare id uuid;
begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],p_received_by);
  select p.payment_id into id from private.register_payment(p_order_id,p_payment_method,p_received_by,p_reference) p;
  perform private.archive_order(p_order_id,p_received_by);
  return query select id,p_order_id,'archivado'::public.order_status;
end $$;

-- Only checked operations are exposed. Lower internal functions cannot be invoked by API roles.
create or replace function public.create_order(p_table_number text, p_customer_name text default null, p_created_by uuid default auth.uid())
returns table(order_id uuid, order_number text) language sql security invoker set search_path = '' as $$
  select * from private.create_order($1,$2,$3)
$$;
create or replace function public.add_order_item(p_order_id uuid, p_menu_item_id uuid, p_quantity integer, p_created_by uuid default auth.uid())
returns table(order_item_id uuid, order_status public.order_status, queue_type public.queue_type) language sql security invoker set search_path = '' as $$
  select * from private.add_order_item($1,$2,$3,$4)
$$;
create or replace function public.update_order_item(p_order_item_id uuid, p_quantity integer default null, p_action text default 'update', p_actor_id uuid default auth.uid())
returns table(order_id uuid, order_item_id uuid, action text) language sql security invoker set search_path = '' as $$
  select * from private.update_order_item($1,$2,$3,$4)
$$;
create or replace function public.confirm_order(p_order_id uuid, p_confirmed_by uuid default auth.uid())
returns table(order_id uuid, status public.order_status, print_job_id uuid) language sql security invoker set search_path = '' as $$
  select * from private.confirm_order($1,$2)
$$;
create or replace function public.create_order_with_items(p_table_number text, p_customer_name text, p_created_by uuid, p_items jsonb)
returns table(order_id uuid, order_number text) language sql security invoker set search_path = '' as $$
  select * from private.create_order_with_items($1,$2,$3,$4)
$$;
create or replace function public.mark_order_item_delivered(p_order_item_id uuid, p_delivered_by uuid default auth.uid())
returns table(order_id uuid, order_item_id uuid, status public.order_item_status) language sql security invoker set search_path = '' as $$
  select * from private.mark_order_item_delivered($1,$2)
$$;
create or replace function public.mark_kitchen_item_delivered(p_order_item_id uuid, p_delivered_by uuid default auth.uid())
returns table(order_id uuid, order_item_id uuid, status public.order_item_status) language sql security invoker set search_path = '' as $$
  select * from private.mark_kitchen_item_delivered($1,$2)
$$;
create or replace function public.mark_order_delivered(p_order_id uuid, p_delivered_by uuid default auth.uid())
returns table(order_id uuid, status public.order_status) language sql security invoker set search_path = '' as $$
  select * from private.mark_order_delivered($1,$2)
$$;
create or replace function public.register_payment(p_order_id uuid, p_payment_method public.payment_method, p_received_by uuid default auth.uid(), p_reference text default null)
returns table(payment_id uuid, order_id uuid, status public.order_status) language sql security invoker set search_path = '' as $$
  select * from private.register_payment($1,$2,$3,$4)
$$;
create or replace function public.archive_order(p_order_id uuid, p_archived_by uuid default auth.uid())
returns table(order_id uuid, status public.order_status) language sql security invoker set search_path = '' as $$
  select * from private.archive_order($1,$2)
$$;
create or replace function public.checkout_order(p_order_id uuid, p_payment_method public.payment_method, p_received_by uuid default auth.uid(), p_reference text default null)
returns table(payment_id uuid, order_id uuid, status public.order_status) language sql security invoker set search_path = '' as $$
  select * from private.checkout_order($1,$2,$3,$4)
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_app_role() to authenticated;
-- deliver_item also checks the selected queue's role; its only public entry points fix the queue.
grant execute on function private.deliver_item(uuid,public.queue_type,uuid) to authenticated;
revoke all on function public.recalculate_order_totals(uuid),public.sync_order_totals(),
  public.touch_updated_at(),public.clear_order_history() from public, anon, authenticated, service_role;
alter function public.touch_updated_at() set search_path = '';
revoke all on function public.current_app_role(),public.has_role(public.user_role[]) from public, anon;
grant execute on function public.current_app_role(),public.has_role(public.user_role[]) to authenticated;
revoke all on function public.create_order(text,text,uuid) from public, anon;
grant execute on function public.create_order(text,text,uuid),private.create_order(text,text,uuid) to authenticated;
revoke all on function public.add_order_item(uuid,uuid,integer,uuid) from public, anon;
grant execute on function public.add_order_item(uuid,uuid,integer,uuid),private.add_order_item(uuid,uuid,integer,uuid) to authenticated;
revoke all on function public.update_order_item(uuid,integer,text,uuid) from public, anon;
grant execute on function public.update_order_item(uuid,integer,text,uuid),private.update_order_item(uuid,integer,text,uuid) to authenticated;
revoke all on function public.confirm_order(uuid,uuid) from public, anon;
grant execute on function public.confirm_order(uuid,uuid),private.confirm_order(uuid,uuid) to authenticated;
revoke all on function public.create_order_with_items(text,text,uuid,jsonb) from public, anon;
grant execute on function public.create_order_with_items(text,text,uuid,jsonb),private.create_order_with_items(text,text,uuid,jsonb) to authenticated;
revoke all on function public.mark_order_item_delivered(uuid,uuid) from public, anon;
grant execute on function public.mark_order_item_delivered(uuid,uuid),private.mark_order_item_delivered(uuid,uuid) to authenticated;
revoke all on function public.mark_kitchen_item_delivered(uuid,uuid) from public, anon;
grant execute on function public.mark_kitchen_item_delivered(uuid,uuid),private.mark_kitchen_item_delivered(uuid,uuid) to authenticated;
revoke all on function public.mark_order_delivered(uuid,uuid) from public, anon;
grant execute on function public.mark_order_delivered(uuid,uuid),private.mark_order_delivered(uuid,uuid) to authenticated;
revoke all on function public.register_payment(uuid,public.payment_method,uuid,text) from public, anon;
grant execute on function public.register_payment(uuid,public.payment_method,uuid,text),private.register_payment(uuid,public.payment_method,uuid,text) to authenticated;
revoke all on function public.archive_order(uuid,uuid) from public, anon;
grant execute on function public.archive_order(uuid,uuid),private.archive_order(uuid,uuid) to authenticated;
revoke all on function public.checkout_order(uuid,public.payment_method,uuid,text) from public, anon;
grant execute on function public.checkout_order(uuid,public.payment_method,uuid,text),private.checkout_order(uuid,public.payment_method,uuid,text) to authenticated;

-- Replace the effective policies, including names that drifted from local migration history.
do $$
declare item record; columns text;
begin
  for item in select p.tablename,p.policyname from pg_policies p where p.schemaname = 'public'
    and p.tablename in ('profiles','categories','menu_items','orders','order_items','order_payments','order_events','print_jobs','order_daily_counters')
  loop
    execute format('drop policy %I on public.%I',item.policyname,item.tablename);
  end loop;
  for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and c.relname in ('profiles','categories','menu_items','orders','order_items','order_payments','order_events','print_jobs','order_daily_counters')
  loop
    execute format('alter table public.%I enable row level security',item.relname);
    execute format('revoke all on table public.%I from public, anon, authenticated',item.relname);
    select string_agg(quote_ident(a.attname),',') into columns from pg_attribute a
      where a.attrelid = format('public.%I',item.relname)::regclass and a.attnum>0 and not a.attisdropped;
    execute format('revoke select(%s),insert(%s),update(%s),references(%s) on public.%I from public,anon,authenticated',columns,columns,columns,columns,item.relname);
  end loop;
end $$;
grant select on public.profiles,public.categories,public.menu_items,public.orders,public.order_items,
  public.order_payments,public.order_events,public.print_jobs to authenticated;
grant insert(name,slug,queue_type,sort_order,active),update(name,slug,queue_type,sort_order,active),delete on public.categories to authenticated;
grant insert(name,category_id,price,sort_order,active),update(name,category_id,price,sort_order,active),delete on public.menu_items to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.current_app_role()) = 'admin');
create policy categories_read on public.categories for select to authenticated using ((select private.current_app_role()) is not null);
create policy categories_admin on public.categories for all to authenticated
  using ((select private.current_app_role()) = 'admin') with check ((select private.current_app_role()) = 'admin');
create policy menu_read on public.menu_items for select to authenticated using ((select private.current_app_role()) is not null);
create policy menu_admin on public.menu_items for all to authenticated
  using ((select private.current_app_role()) = 'admin') with check ((select private.current_app_role()) = 'admin');
create policy orders_read on public.orders for select to authenticated using (
  (select private.current_app_role()) in ('admin','staff') or
  ((select private.current_app_role()) in ('cook','barista') and status in ('confirmado','entregado'))
);
create policy items_read on public.order_items for select to authenticated using (
  (select private.current_app_role()) in ('admin','staff') or
  (((select private.current_app_role()) = 'cook' and queue_type = 'kitchen'
    or (select private.current_app_role()) = 'barista' and queue_type = 'cafe')
    and exists(select 1 from public.orders o where o.id = order_id and o.status in ('confirmado','entregado')))
);
create policy payments_read on public.order_payments for select to authenticated using ((select private.current_app_role()) in ('admin','staff'));
create policy events_read on public.order_events for select to authenticated using ((select private.current_app_role()) in ('admin','staff'));
create policy print_read on public.print_jobs for select to authenticated using ((select private.current_app_role()) in ('admin','cook'));
-- No table writes for profiles/orders/items/payments/events/print_jobs/counters.
-- Existing service_role administration remains server-only and outside the client contract.

create or replace view public.v_open_orders with(security_invoker=true) as
select o.id,o.order_number,o.table_number,o.customer_name,o.status,o.created_at,o.confirmed_at,o.delivered_at,o.paid_at,
  count(oi.id) filter(where oi.status <> 'voided') as item_count,o.total::numeric as total
from public.orders o left join public.order_items oi on oi.order_id=o.id
where o.status in ('pendiente','confirmado','entregado') group by o.id;

-- Keep the report shape; period/filter improvements belong to P09.
create or replace view public.v_sales_report_line_items with(security_invoker=true) as
select date_trunc('day',coalesce(o.paid_at,o.archived_at,o.created_at))::date as date,
  oi.item_name as product_or_service,oi.quantity,oi.unit_price,oi.net_total as total_sale_value,
  op.method as payment_method,o.order_number,o.status,o.created_at as order_time
from public.orders o join public.order_items oi on oi.order_id=o.id
left join public.order_payments op on op.order_id=o.id
where o.status in ('pagado','archivado') and oi.status <> 'voided' and (select private.current_app_role()) = 'admin';

do $$
declare item record;
begin
  for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v' and c.relname in
    ('v_open_orders','v_order_detail','v_cafe_queue','v_kitchen_tickets','v_sales_report_line_items','v_sales_report_daily','v_sales_report_weekly','v_sales_report_monthly')
  loop
    execute format('alter view public.%I set(security_invoker=true)',item.relname);
    execute format('revoke all on public.%I from public,anon,authenticated',item.relname);
    execute format('grant select on public.%I to authenticated',item.relname);
  end loop;
end $$;
notify pgrst, 'reload schema';
