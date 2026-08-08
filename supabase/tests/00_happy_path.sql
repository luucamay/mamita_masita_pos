-- Happy path for the POS lifecycle.
-- Run this inside a Supabase Postgres session with the seed data loaded.

begin;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claim.role = 'authenticated';

do $$
declare
  v_order_id uuid;
  v_order_number text;
  v_kitchen_item_id uuid;
  v_cafe_item_id uuid;
  v_paid_id uuid;
  v_status public.order_status;
begin
  select order_id, order_number
  into v_order_id, v_order_number
  from public.create_order('12', 'Cliente Demo', '22222222-2222-2222-2222-222222222222');

  if v_order_number !~ '^[0-9]{8}-[0-9]{3}$' then
    raise exception 'unexpected order number %', v_order_number;
  end if;

  select order_item_id
  into v_kitchen_item_id
  from public.add_order_item(
    v_order_id,
    'bbbbbbbb-0000-0000-0000-000000000001',
    2,
    '22222222-2222-2222-2222-222222222222'
  );

  select order_item_id
  into v_cafe_item_id
  from public.add_order_item(
    v_order_id,
    'aaaaaaaa-0000-0000-0000-000000000001',
    1,
    '22222222-2222-2222-2222-222222222222'
  );

  perform public.confirm_order(v_order_id, '22222222-2222-2222-2222-222222222222');

  if not exists (
    select 1
    from public.print_jobs
    where order_id = v_order_id
      and job_type = 'kitchen_ticket'
      and status = 'queued'
  ) then
    raise exception 'missing kitchen print job';
  end if;

  perform public.mark_order_item_delivered(
    v_cafe_item_id,
    '44444444-4444-4444-4444-444444444444'
  );

  select status into v_status from public.orders where id = v_order_id;
  if v_status <> 'confirmado' then
    raise exception 'order should still be confirmed while kitchen items remain open, got %', v_status;
  end if;

  perform public.mark_order_delivered(
    v_order_id,
    '22222222-2222-2222-2222-222222222222'
  );

  select status into v_status from public.orders where id = v_order_id;
  if v_status <> 'entregado' then
    raise exception 'order should be delivered, got %', v_status;
  end if;

  select payment_id
  into v_paid_id
  from public.register_payment(
    v_order_id,
    'cash',
    '22222222-2222-2222-2222-222222222222',
    'cash-desk-1'
  );

  if v_paid_id is null then
    raise exception 'payment was not created';
  end if;

  perform public.archive_order(v_order_id, '22222222-2222-2222-2222-222222222222');

  if not exists (
    select 1
    from public.v_sales_report_line_items
    where order_number = v_order_number
  ) then
    raise exception 'archived order missing from report view';
  end if;
end $$;

rollback;
