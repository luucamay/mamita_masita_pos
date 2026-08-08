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
  from public.order_items as oi
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
  from public.order_items as oi
  join public.orders as o on o.id = oi.order_id
  where oi.id = p_order_item_id
    and o.status not in ('pagado', 'archivado');

  if v_order_id is null then
    raise exception 'order item not found or not deliverable';
  end if;

  if v_queue_type <> 'cafe' then
    raise exception 'only cafe items can be delivered from the cafe queue';
  end if;

  update public.order_items as oi
  set status = 'delivered',
      delivered_at = now()
  where oi.id = p_order_item_id;

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
