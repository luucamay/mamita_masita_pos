-- P13: publish headers without replacing the existing item publication or RLS.
do $$ begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then raise exception 'Realtime publication is missing'; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

create function public.get_orders_board(p_closed boolean default false,p_selected_order uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare result jsonb;
begin
  if (select private.current_app_role()) is null or (select private.current_app_role()) not in ('admin','staff') then
    raise exception using errcode='42501',message='Acceso no autorizado a pedidos';
  end if;
  if p_closed is null then raise exception using errcode='22023',message='Vista inválida'; end if;
  with headers as materialized (
    select o.*,case when p_closed then coalesce(o.paid_at,o.created_at) else o.created_at end as board_sort
    from public.orders o where (p_closed and o.status in ('pagado','archivado') or not p_closed and o.status in ('pendiente','confirmado','entregado') and o.employee_cancelled_at is null) or o.id=p_selected_order
  ), snapshots as materialized (
    select h.id,h.board_sort,h.status,h.employee_cancelled_at,
      (to_jsonb(h)-'board_sort')||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.order_items i where i.order_id=h.id),'[]'::jsonb),
      'item_count',(select count(*) from public.order_items i where i.order_id=h.id and i.status<>'voided')) as snapshot
    from headers h
  ) select jsonb_build_object('orders',coalesce((select jsonb_agg(snapshot order by board_sort desc,id desc) from snapshots where p_closed and status in ('pagado','archivado') or not p_closed and status in ('pendiente','confirmado','entregado') and employee_cancelled_at is null),'[]'::jsonb),
    'selected',(select snapshot from snapshots where id=p_selected_order),'server_time',clock_timestamp()) into result;
  return result;
end $$;
revoke all on function public.get_orders_board(boolean,uuid) from public,anon;
grant execute on function public.get_orders_board(boolean,uuid) to authenticated;
notify pgrst,'reload schema';
