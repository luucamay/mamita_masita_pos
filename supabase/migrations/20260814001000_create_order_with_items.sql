create or replace function public.create_order_with_items(
  p_table_number text,
  p_customer_name text,
  p_created_by uuid,
  p_items jsonb
)
returns table(order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
begin
  if p_created_by is distinct from auth.uid()
     or not public.has_role(array['admin', 'staff']::public.user_role[]) then
    raise exception 'not authorized';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order must have items';
  end if;

  select co.order_id, co.order_number
  into v_order_id, v_order_number
  from public.create_order(p_table_number, p_customer_name, p_created_by) co;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    perform public.add_order_item(
      v_order_id,
      (v_item ->> 'menu_item_id')::uuid,
      (v_item ->> 'quantity')::integer,
      p_created_by
    );
  end loop;

  perform public.confirm_order(v_order_id, p_created_by);
  return query select v_order_id, v_order_number;
end;
$$;

grant execute on function public.create_order_with_items(text, text, uuid, jsonb) to authenticated;

create index if not exists orders_open_created_at_idx
  on public.orders (created_at desc)
  where status in ('pendiente', 'confirmado', 'entregado');

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists order_items_queue_status_idx
  on public.order_items (queue_type, status, order_id);
