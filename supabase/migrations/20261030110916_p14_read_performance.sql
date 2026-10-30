-- Preserve the P13 RPC for already deployed clients; the new web uses this
-- bounded closed-order read. Active orders remain complete and uncapped.
create function public.get_orders_board_page(p_closed boolean default false,p_selected_order uuid default null,p_page integer default 1)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare result jsonb;
begin
  if (select private.current_app_role()) is null or (select private.current_app_role()) not in ('admin','staff') then
    raise exception using errcode='42501',message='Acceso no autorizado a pedidos';
  end if;
  if p_closed is null or p_page is null or p_page<1 or p_page>1000000 or (not p_closed and p_page<>1) then
    raise exception using errcode='22023',message='Página inválida';
  end if;
  if not p_closed then return public.get_orders_board(false,p_selected_order)||jsonb_build_object('pagination',null); end if;
  with eligible as materialized (
    select o.*,coalesce(o.paid_at,o.created_at) as board_sort from public.orders o where o.status in ('pagado','archivado')
  ), info as (
    select count(*)::integer as total,greatest(1,ceil(count(*)/24.0)::integer) as pages from eligible
  ), selected_page as materialized (
    select * from eligible order by board_sort desc,id desc limit 24 offset (select (least(p_page,pages)-1)*24 from info)
  ), headers as (
    select * from selected_page union all
    select o.*,coalesce(o.paid_at,o.created_at) as board_sort from public.orders o
    where o.id=p_selected_order and not exists(select 1 from selected_page p where p.id=o.id)
  ), snapshots as materialized (
    select h.id,h.board_sort,(to_jsonb(h)-'board_sort')||jsonb_build_object(
      'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.order_items i where i.order_id=h.id),'[]'::jsonb),
      'item_count',(select count(*) from public.order_items i where i.order_id=h.id and i.status<>'voided')) as snapshot from headers h
  ) select jsonb_build_object(
    'orders',coalesce((select jsonb_agg(s.snapshot order by s.board_sort desc,s.id desc) from snapshots s join selected_page p on p.id=s.id),'[]'::jsonb),
    'selected',(select snapshot from snapshots where id=p_selected_order),
    'pagination',(select jsonb_build_object('page',least(p_page,pages),'size',24,'total',total,'pages',pages) from info),
    'server_time',clock_timestamp()) into result;
  return result;
end $$;
revoke all on function public.get_orders_board_page(boolean,uuid,integer) from public,anon;
grant execute on function public.get_orders_board_page(boolean,uuid,integer) to authenticated;
notify pgrst,'reload schema';
