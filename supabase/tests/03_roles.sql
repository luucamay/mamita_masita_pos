-- Explicit role matrix checks. Every denied mutation is asserted both by
-- error and by the absence of a row, since UPDATE/DELETE can otherwise return
-- zero rows without raising an exception under RLS.

begin;

set local request.jwt.claim.role = 'authenticated';
set local role authenticated;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  insert into public.menu_items (category_id, name, price)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin RLS Probe', 10.00);
  if not exists (select 1 from public.menu_items where name = 'Admin RLS Probe') then
    raise exception 'admin should be able to write menu items';
  end if;
end $$;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.menu_items (category_id, name, price)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Staff Menu Probe', 10.00);
  exception
    when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'staff menu write should fail'; end if;
  if exists (select 1 from public.menu_items where name = 'Staff Menu Probe') then
    raise exception 'staff menu write must not create a row';
  end if;
end $$;

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.menu_items (category_id, name, price)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cook Menu Probe', 10.00);
  exception
    when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'cook menu write should fail'; end if;
  if exists (select 1 from public.menu_items where name = 'Cook Menu Probe') then
    raise exception 'cook menu write must not create a row';
  end if;
end $$;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.menu_items (category_id, name, price)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Barista Menu Probe', 10.00);
  exception
    when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'barista menu write should fail'; end if;
  if exists (select 1 from public.menu_items where name = 'Barista Menu Probe') then
    raise exception 'barista menu write must not create a row';
  end if;
end $$;

-- Staff can create orders; cook and barista can read them but cannot mutate them.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.orders (id, order_number, table_number, created_by)
values ('99999999-9999-9999-9999-999999999991', 'RLS-STAFF-001', 'RLS',
        '22222222-2222-2222-2222-222222222222');

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_rows integer;
begin
  update public.orders set customer_name = 'Cook must not update'
  where id = '99999999-9999-9999-9999-999999999991';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'cook order update should affect zero rows'; end if;
end $$;

insert into public.print_jobs (order_id, job_type, target)
values ('99999999-9999-9999-9999-999999999991', 'kitchen_ticket', 'test-printer');

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.print_jobs (order_id, job_type, target)
    values ('99999999-9999-9999-9999-999999999991', 'cafe_ticket', 'test-printer');
  exception
    when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'barista print-job write should fail'; end if;
end $$;

-- Only admin/staff can write payments, while all four roles can write events.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.order_payments (order_id, method, amount, received_by)
values ('99999999-9999-9999-9999-999999999991', 'cash', 0, '22222222-2222-2222-2222-222222222222');

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.order_payments (order_id, method, amount, received_by)
    values ('99999999-9999-9999-9999-999999999991', 'qr', 0,
            '33333333-3333-3333-3333-333333333333');
  exception
    when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'cook payment write should fail'; end if;
end $$;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.order_payments (order_id, method, amount, received_by)
    values ('99999999-9999-9999-9999-999999999991', 'card', 0,
            '44444444-4444-4444-4444-444444444444');
  exception
    when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'barista payment write should fail'; end if;
end $$;

rollback;
