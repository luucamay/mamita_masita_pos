-- Keep the order creation time available in each history row.
create or replace view public.v_sales_report_line_items
with (security_invoker = true)
as
select
  date_trunc('day', coalesce(o.paid_at, o.archived_at, o.created_at))::date as date,
  oi.item_name as product_or_service,
  oi.quantity,
  oi.unit_price,
  oi.line_total as total_sale_value,
  op.method as payment_method,
  o.order_number,
  o.status,
  o.created_at as order_time
from public.orders o
join public.order_items oi on oi.order_id = o.id
left join public.order_payments op on op.order_id = o.id
where o.status in ('pagado', 'archivado');

create or replace view public.v_sales_report_daily
with (security_invoker = true)
as
select
  date,
  product_or_service,
  sum(quantity)::bigint as quantity,
  unit_price,
  sum(total_sale_value) as total_sale_value,
  payment_method,
  order_time
from public.v_sales_report_line_items
group by date, order_time, product_or_service, unit_price, payment_method;

create or replace view public.v_sales_report_weekly
with (security_invoker = true)
as
select
  date_trunc('week', date::timestamp)::date as date,
  product_or_service,
  sum(quantity)::bigint as quantity,
  unit_price,
  sum(total_sale_value) as total_sale_value,
  payment_method,
  order_time
from public.v_sales_report_line_items
group by date_trunc('week', date::timestamp)::date, order_time, product_or_service, unit_price, payment_method;

create or replace view public.v_sales_report_monthly
with (security_invoker = true)
as
select
  date_trunc('month', date::timestamp)::date as date,
  product_or_service,
  sum(quantity)::bigint as quantity,
  unit_price,
  sum(total_sale_value) as total_sale_value,
  payment_method,
  order_time
from public.v_sales_report_line_items
group by date_trunc('month', date::timestamp)::date, order_time, product_or_service, unit_price, payment_method;

grant select on public.v_sales_report_daily to authenticated;
grant select on public.v_sales_report_weekly to authenticated;
grant select on public.v_sales_report_monthly to authenticated;
