-- Read-only employee sales history: author of customer orders, by registration
-- date in Bolivia. This is operational attribution, not cash-day accounting.
create index orders_customer_author_history_idx
 on public.orders(created_by,created_at desc,id desc) where purchase_type='customer';

create function public.admin_employee_sales_history(
 p_employee_id uuid,p_start date default null,p_end date default null,p_page integer default 0
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare first_day date:=coalesce(p_start,(current_timestamp at time zone 'America/La_Paz')::date);
 last_day date:=coalesce(p_end,first_day); result jsonb;
begin
 if (select private.current_app_role()) is distinct from 'admin'::public.user_role then
  raise exception using errcode='42501',message='Solo Administración puede consultar ventas del equipo';
 end if;
 if p_employee_id is null or not exists(select 1 from public.profiles where id=p_employee_id)
  or first_day < date '2000-01-01' or last_day > date '2099-12-31'
  or last_day<first_day or last_day-first_day>365 or p_page is null or p_page<0 or p_page>100000 then
  raise exception using errcode='22023',message='Revisa el empleado y el rango de fechas (máximo 366 días)';
 end if;
 with selected as materialized (
  select o.id,o.order_number,o.table_number,o.customer_name,o.created_at,o.status,o.paid_at,o.total
  from public.orders o
  where o.created_by=p_employee_id and o.purchase_type='customer'
   and o.created_at >= (first_day::timestamp at time zone 'America/La_Paz')
   and o.created_at < ((last_day+1)::timestamp at time zone 'America/La_Paz')
 ), receipts as materialized (
  select p.order_id,p.received_by,p.method,p.amount from public.order_payments p join selected s on s.id=p.order_id
   where not exists(select 1 from public.order_cash_movements m where m.order_id=p.order_id and m.kind='initial')
  union all
  select m.order_id,m.received_by,m.method,m.amount from public.order_cash_movements m join selected s on s.id=m.order_id
 ), page_rows as (
  select * from selected order by created_at desc,id desc limit 25 offset (p_page*25)
 ) select jsonb_build_object(
  'range',jsonb_build_object('start',first_day,'end',last_day,'today',(current_timestamp at time zone 'America/La_Paz')::date),
  'page',p_page,'page_size',25,'total_count',(select count(*) from selected),
  'summary',jsonb_build_object('orders',(select count(*) from selected),'total',coalesce((select sum(total) from selected),0),
   'collected',coalesce((select sum(amount) from receipts),0),'pending',(select count(*) from selected where paid_at is null)),
  'orders',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'order_number',s.order_number,'table_number',s.table_number,'customer_name',s.customer_name,
   'created_at',s.created_at,'status',s.status,'paid_at',s.paid_at,'total',s.total,
   'collected',coalesce((select sum(r.amount) from receipts r where r.order_id=s.id),0),
   'cashiers',coalesce((select jsonb_agg(jsonb_build_object('id',c.received_by,'name',coalesce(nullif(p.full_name,''),'Sin nombre'))) from
    (select distinct r.received_by from receipts r where r.order_id=s.id) c left join public.profiles p on p.id=c.received_by),'[]'::jsonb),
   'methods',coalesce((select jsonb_agg(c.method order by c.method) from (select distinct r.method from receipts r where r.order_id=s.id) c),'[]'::jsonb),
   'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.item_name,'quantity',i.quantity) order by i.created_at,i.id) from public.order_items i where i.order_id=s.id and i.status<>'voided'),'[]'::jsonb)
  ) order by s.created_at desc,s.id desc) from page_rows s),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.admin_employee_sales_history(uuid,date,date,integer) from public,anon;
grant execute on function public.admin_employee_sales_history(uuid,date,date,integer) to authenticated;
notify pgrst,'reload schema';
