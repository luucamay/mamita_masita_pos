-- Synthetic data only. This fixture is for the temporary native PostgreSQL runner.
insert into public.profiles(id,role,full_name,active) values
('11111111-1111-1111-1111-111111111111','admin','QA Admin',true),
('22222222-2222-2222-2222-222222222222','staff','QA Staff',true),
('33333333-3333-3333-3333-333333333333','cook','QA Cook',true),
('44444444-4444-4444-4444-444444444444','barista','QA Barista',true),
('55555555-5555-5555-5555-555555555555','staff','QA Inactive',false);
insert into public.categories(id,name,slug,queue_type) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cafés QA','cafe-qa','cafe'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Cocina QA','cocina-qa','kitchen');
insert into public.menu_items(id,category_id,name,price) values
('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Espresso QA',10),
('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Focaccia QA',49),
('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cappuccino QA',20),
('aaaaaaaa-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Centavo QA',0.01);

-- A pre-migration sale whose prices/amounts/status must remain unchanged.
insert into public.orders(id,order_number,table_number,created_by) values
('99999999-9999-9999-9999-999999999999','LEGACY-QA','QA','22222222-2222-2222-2222-222222222222');
insert into public.order_items(order_id,item_name,category_name,queue_type,unit_price,quantity,status) values
('99999999-9999-9999-9999-999999999999','Venta histórica QA','QA','cafe',59,1,'delivered');
insert into public.order_payments(order_id,method,amount) values
('99999999-9999-9999-9999-999999999999','cash',59);
update public.orders set status='archivado',payment_method='cash',paid_at=now(),archived_at=now()
where id='99999999-9999-9999-9999-999999999999';

-- Reproduce the relevant production drift: broad policies and role lookup without active.
do $$ declare row record; begin
  for row in select tablename,policyname from pg_policies where schemaname='public' loop
    execute format('drop policy %I on public.%I',row.policyname,row.tablename);
  end loop;
  for row in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',row.tablename);
    execute format('create policy mvp_authenticated on public.%I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)',row.tablename);
    execute format('grant all on public.%I to anon,authenticated',row.tablename);
  end loop;
end $$;
create or replace function public.current_app_role() returns public.user_role
language sql stable security invoker as $$ select role from public.profiles where id=auth.uid() limit 1 $$;
alter view public.v_kitchen_tickets set(security_invoker=false);
