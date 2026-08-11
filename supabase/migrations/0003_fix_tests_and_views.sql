alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

update public.orders
set updated_at = coalesce(updated_at, now())
where updated_at is null;

grant select on public.v_open_orders to authenticated;
grant select on public.v_cafe_queue to authenticated;
grant select on public.v_kitchen_tickets to authenticated;
grant select on public.v_order_detail to authenticated;
grant select on public.v_sales_report_line_items to authenticated;
