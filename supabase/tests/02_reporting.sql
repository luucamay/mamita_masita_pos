-- Reporting checks for daily, weekly, and monthly sales exports.

begin;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claim.role = 'authenticated';

do $$
declare
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_rows integer;
begin
  select order_id, order_number
  into v_order_id, v_order_number
  from public.create_order('21', 'Reporte Demo', '11111111-1111-1111-1111-111111111111');

  select order_item_id
  into v_item_id
  from public.add_order_item(
    v_order_id,
    'cccccccc-0000-0000-0000-000000000001',
    1,
    '11111111-1111-1111-1111-111111111111'
  );

  perform public.confirm_order(v_order_id, '11111111-1111-1111-1111-111111111111');
  perform public.mark_order_delivered(v_order_id, '11111111-1111-1111-1111-111111111111');
  perform public.register_payment(v_order_id, 'qr', '11111111-1111-1111-1111-111111111111', 'qr-terminal-1');
  perform public.archive_order(v_order_id, '11111111-1111-1111-1111-111111111111');

  select count(*) into v_rows
  from public.v_sales_report_line_items;

  if v_rows < 1 then
    raise exception 'report view should contain archived sales rows';
  end if;

  if not exists (
    select 1
    from public.v_sales_report_line_items
    where order_number = v_order_number
      and payment_method = 'qr'
  ) then
    raise exception 'report view should contain the seeded qr payment row';
  end if;

  if not exists (
    select 1
    from public.v_sales_report_line_items
    where date = current_date
      and order_number = v_order_number
  ) then
    raise exception 'daily export should include the current order';
  end if;

  if not exists (
    select 1
    from public.v_sales_report_line_items
    where date_trunc('week', date::timestamp) = date_trunc('week', current_date::timestamp)
      and order_number = v_order_number
  ) then
    raise exception 'weekly export should include the current order';
  end if;

  if not exists (
    select 1
    from public.v_sales_report_line_items
    where date_trunc('month', date::timestamp) = date_trunc('month', current_date::timestamp)
      and order_number = v_order_number
  ) then
    raise exception 'monthly export should include the current order';
  end if;
end $$;

rollback;
