-- P09: admin-only reporting snapshot, paid dates in Bolivia; existing sales unchanged.
create index order_payments_paid_at_idx on public.order_payments(paid_at,order_id);
create function public.get_sales_report(p_period text default 'daily',p_date date default null,p_payment_filter text default 'all',p_purchase_filter text default 'all')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare anchor date:=coalesce(p_date,(current_timestamp at time zone 'America/La_Paz')::date); first_day date; after_day date; result jsonb;
begin
 if (select private.current_app_role()) is distinct from 'admin'::public.user_role then raise exception using errcode='42501',message='Solo Administración puede consultar reportes'; end if;
 if p_period is null or p_period not in ('daily','weekly','monthly') or p_payment_filter is null or p_payment_filter not in ('all','cash','qr','other') or p_purchase_filter is null or p_purchase_filter not in ('all','customer','employee') or anchor not between date '2000-01-01' and date '2099-12-31' then raise exception using errcode='22023',message='Filtros de reporte inválidos'; end if;
 first_day:=case p_period when 'daily' then anchor when 'weekly' then date_trunc('week',anchor::timestamp)::date else date_trunc('month',anchor::timestamp)::date end;
 after_day:=case p_period when 'daily' then first_day+1 when 'weekly' then first_day+7 else (first_day+interval '1 month')::date end;
 with paid as materialized (
  select o.id,o.purchase_type,p.method,p.amount from public.order_payments p join public.orders o on o.id=p.order_id
  where p.paid_at >= (first_day::timestamp at time zone 'America/La_Paz') and p.paid_at < (after_day::timestamp at time zone 'America/La_Paz')
   and o.status in ('pagado','archivado') and o.employee_cancelled_at is null and (p_purchase_filter='all' or o.purchase_type=p_purchase_filter)
 ), lines as materialized (
  select i.menu_item_id,i.item_name,i.quantity,i.unit_price,i.net_total,p.method,p.purchase_type from paid p join public.order_items i on i.order_id=p.id where i.status<>'voided'
 ), filtered_paid as materialized (
  select * from paid where p_payment_filter='all' or method::text=p_payment_filter or p_payment_filter='other' and method not in ('cash','qr')
 ), filtered_lines as materialized (
  select * from lines where p_payment_filter='all' or method::text=p_payment_filter or p_payment_filter='other' and method not in ('cash','qr')
 ), grouped as (
  select menu_item_id,item_name,method,purchase_type,sum(quantity) as quantity,case when min(unit_price)=max(unit_price) then min(unit_price) else null end as unit_price,sum(net_total) as total_sale_value
  from filtered_lines group by menu_item_id,item_name,method,purchase_type
 ) select jsonb_build_object(
  'range',jsonb_build_object('period',p_period,'date',anchor,'start_date',first_day,'end_date_exclusive',after_day,'time_zone','America/La_Paz'),
  'filters',jsonb_build_object('payment',p_payment_filter,'purchase',p_purchase_filter),
  'summary',jsonb_build_object('total',coalesce((select sum(amount) from paid),0),'orders',(select count(*) from paid),'units',coalesce((select sum(quantity) from lines),0),
   'cash',jsonb_build_object('amount',coalesce((select sum(amount) from paid where method='cash'),0),'orders',(select count(*) from paid where method='cash')),
   'qr',jsonb_build_object('amount',coalesce((select sum(amount) from paid where method='qr'),0),'orders',(select count(*) from paid where method='qr')),
   'other',jsonb_build_object('amount',coalesce((select sum(amount) from paid where method not in ('cash','qr')),0),'orders',(select count(*) from paid where method not in ('cash','qr')))),
  'filtered',jsonb_build_object('total',coalesce((select sum(amount) from filtered_paid),0),'orders',(select count(*) from filtered_paid),'units',coalesce((select sum(quantity) from filtered_lines),0)),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('date',first_day,'menu_item_id',menu_item_id,'product_or_service',item_name,'quantity',quantity,'unit_price',unit_price,'total_sale_value',total_sale_value,'payment_method',method,'purchase_type',purchase_type) order by item_name,menu_item_id,method,purchase_type) from grouped),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.get_sales_report(text,date,text,text) from public,anon;
grant execute on function public.get_sales_report(text,date,text,text) to authenticated;
notify pgrst,'reload schema';
