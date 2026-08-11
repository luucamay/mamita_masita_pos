drop view if exists public.v_kitchen_tickets;

create view public.v_kitchen_tickets as
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
  oi.printed_at,
  oi.created_at
from public.order_items oi
join public.orders o on o.id = oi.order_id
where oi.queue_type = 'kitchen'
  and o.status in ('pendiente', 'confirmado', 'entregado');

create or replace function public.mark_kitchen_item_delivered(
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

  if v_order_id is null or v_queue_type <> 'kitchen' then
    raise exception 'kitchen item not found or not deliverable';
  end if;

  update public.order_items
  set status = 'delivered', delivered_at = now()
  where id = p_order_item_id;

  if not exists (
    select 1 from public.order_items oi
    where oi.order_id = v_order_id and oi.status <> 'delivered'
  ) then
    update public.orders
    set status = 'entregado', delivered_at = now(), delivered_by = coalesce(p_delivered_by, delivered_by)
    where id = v_order_id;
  end if;

  insert into public.order_events (order_id, actor_id, event_type, payload)
  values (v_order_id, p_delivered_by, 'order_item_delivered',
    jsonb_build_object('order_item_id', p_order_item_id, 'queue_type', v_queue_type));

  return query select v_order_id, p_order_item_id, 'delivered'::public.order_item_status;
end;
$$;

grant select on public.v_kitchen_tickets to authenticated;
grant execute on function public.mark_kitchen_item_delivered(uuid, uuid) to authenticated;
