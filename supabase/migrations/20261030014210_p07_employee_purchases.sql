-- P07: personal purchases use a fixed, non-stacking 20%; cashier confirms receipt/hand-over.
alter table public.orders add column employee_cancelled_at timestamptz;
create index orders_employee_history_idx on public.orders(buyer_employee_id,created_at desc,id desc) where purchase_type='employee';
create table private.employee_purchase_requests (
  request_id uuid primary key,actor_id uuid not null references public.profiles(id),
  order_id uuid not null unique references public.orders(id) on delete cascade,payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.employee_purchase_requests enable row level security;
revoke all on private.employee_purchase_requests from public,anon,authenticated;

create or replace function private.employee_purchase_snapshot(p_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('order',to_jsonb(o)||jsonb_build_object('buyer_name',p.full_name,'buyer_active',p.active,'item_count',(select count(*) from public.order_items i where i.order_id=o.id and i.status<>'voided')),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at,i.id) from public.order_items i where i.order_id=o.id),'[]'))
 from public.orders o join public.profiles p on p.id=o.buyer_employee_id where o.id=p_id and o.purchase_type='employee'
$$;
create or replace function private.create_employee_purchase(p_items jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; prior private.employee_purchase_requests; entry jsonb; product record; v_id uuid; v_number text;
begin
 actor:=private.assert_actor(array['admin','staff','cook','barista']::public.user_role[],auth.uid());
 if p_request_id is null or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception using errcode='22023',message='Compra inválida'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 then raise exception using errcode='22023',message='Selecciona de 1 a 100 productos'; end if;
 perform pg_advisory_xact_lock(20261031,hashtext(p_request_id::text));
 actor:=private.assert_actor(array['admin','staff','cook','barista']::public.user_role[],auth.uid());
 select * into prior from private.employee_purchase_requests r where r.request_id=p_request_id;
 if found then
   if prior.actor_id<>actor or prior.payload<>p_items then raise exception using errcode='42501',message='La operación pertenece a otra compra'; end if;
   return private.employee_purchase_snapshot(prior.order_id);
 end if;
 if exists(select 1 from jsonb_array_elements(p_items)e group by e->>'menu_item_id' having count(*)>1) then raise exception using errcode='22023',message='Producto repetido'; end if;
 perform 1 from public.menu_items mi join public.categories c on c.id=mi.category_id where mi.id in(select (e->>'menu_item_id')::uuid from jsonb_array_elements(p_items)e) order by mi.id for share of mi,c;
 for entry in select value from jsonb_array_elements(p_items) loop
   if coalesce(entry->>'quantity','')!~'^[1-9][0-9]{0,2}$' then raise exception using errcode='22023',message='La cantidad debe ser de 1 a 999'; end if;
   select mi.*,c.name as category,c.queue_type into product from public.menu_items mi join public.categories c on c.id=mi.category_id where mi.id=(entry->>'menu_item_id')::uuid and mi.active and c.active;
   if not found or entry->>'expected_unit_price' is null or product.price is distinct from (entry->>'expected_unit_price')::numeric then raise exception using errcode='40001',message='Un producto o precio cambió. Actualiza y revisa el total'; end if;
 end loop;
 v_id:=gen_random_uuid();v_number:='EMP-'||v_id::text;
 insert into public.orders(id,order_number,table_number,customer_name,created_by,purchase_type,buyer_employee_id,discount_bps)
   select v_id,v_number,'Empleado',p.full_name,actor,'employee',actor,2000 from public.profiles p where p.id=actor;
 for entry in select value from jsonb_array_elements(p_items) loop
   insert into public.order_items(order_id,menu_item_id,item_name,category_name,queue_type,unit_price,quantity)
   select v_id,mi.id,mi.name,c.name,c.queue_type,mi.price,(entry->>'quantity')::int from public.menu_items mi join public.categories c on c.id=mi.category_id where mi.id=(entry->>'menu_item_id')::uuid;
 end loop;
 insert into private.employee_purchase_requests(request_id,actor_id,order_id,payload) values(p_request_id,actor,v_id,p_items);
 insert into public.order_events(order_id,actor_id,event_type,payload) values(v_id,actor,'employee_purchase_requested',jsonb_build_object('buyer_employee_id',actor,'discount_bps',2000));
 return private.employee_purchase_snapshot(v_id);
end $$;

create or replace function private.checkout_employee_purchase(p_order_id uuid,p_payment_method public.payment_method,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; row public.orders; payment public.order_payments;
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 row:=private.lock_order(p_order_id);
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if row.purchase_type<>'employee' or row.discount_bps<>2000 then raise exception 'No es una compra personal válida'; end if;
 if p_payment_method is null or p_payment_method not in ('cash','qr') then raise exception using errcode='22023',message='Selecciona Efectivo o QR'; end if;
 select * into payment from public.order_payments p where p.order_id=p_order_id;
 if found then
   if row.status<>'archivado' or payment.method<>p_payment_method or payment.amount<>row.total then raise exception 'La compra ya tiene otro pago'; end if;
   return private.employee_purchase_snapshot(p_order_id);
 end if;
 if row.employee_cancelled_at is not null or row.status<>'pendiente' then raise exception 'La compra ya no admite cobro'; end if;
 if row.revision is distinct from p_expected_revision then raise exception using errcode='40001',message='La compra cambió. Actualiza antes de cobrar'; end if;
 if not exists(select 1 from public.profiles p where p.id=row.buyer_employee_id and p.active) then raise exception 'El empleado está desactivado; cancela esta compra'; end if;
 perform private.recalculate_order_totals(p_order_id);
 update public.order_items set status='delivered',delivered_at=now() where order_id=p_order_id and status='pending';
 select * into row from public.orders where id=p_order_id;
 insert into public.order_payments(order_id,method,amount,received_by) values(p_order_id,p_payment_method,row.total,actor);
 update public.orders set status='archivado',confirmed_at=now(),confirmed_by=actor,delivered_at=now(),delivered_by=actor,
   paid_at=now(),paid_by=actor,payment_method=p_payment_method,archived_at=now() where id=p_order_id;
 insert into public.order_events(order_id,actor_id,event_type,payload) values(p_order_id,actor,'employee_purchase_paid',jsonb_build_object('buyer_employee_id',row.buyer_employee_id,'payment_method',p_payment_method,'amount',row.total));
 return private.employee_purchase_snapshot(p_order_id);
end $$;
create or replace function private.cancel_employee_purchase(p_order_id uuid,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; row public.orders;
begin
 actor:=private.assert_actor(array['admin','staff','cook','barista']::public.user_role[],auth.uid());
 row:=private.lock_order(p_order_id);
 actor:=private.assert_actor(array['admin','staff','cook','barista']::public.user_role[],auth.uid());
 if row.purchase_type<>'employee' or (row.buyer_employee_id<>actor and private.current_app_role() not in ('admin','staff')) then raise exception using errcode='42501',message='Compra no autorizada'; end if;
 if row.paid_at is not null or row.status<>'pendiente' then raise exception 'No se puede cancelar una compra cobrada'; end if;
 if row.employee_cancelled_at is not null then return private.employee_purchase_snapshot(p_order_id); end if;
 if row.revision is distinct from p_expected_revision then raise exception using errcode='40001',message='La compra cambió. Actualiza antes de cancelar'; end if;
 update public.orders set employee_cancelled_at=now() where id=p_order_id;
 insert into public.order_events(order_id,actor_id,event_type) values(p_order_id,actor,'employee_purchase_cancelled');
 return private.employee_purchase_snapshot(p_order_id);
end $$;
create or replace function private.list_employee_purchases(p_scope text default 'mine',p_before_created_at timestamptz default null,p_before_id uuid default null,p_limit int default 20,p_state text default 'all')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
 actor:=private.assert_actor(array['admin','staff','cook','barista']::public.user_role[],auth.uid());
 if p_scope is null or p_scope not in ('mine','all') or p_state is null or p_state not in ('all','pending','paid','cancelled') or p_limit is null or p_limit not between 1 and 50 or (p_before_created_at is null)<>(p_before_id is null) then raise exception using errcode='22023',message='Filtro inválido'; end if;
 if p_scope='all' then perform private.assert_actor(array['admin','staff']::public.user_role[],actor); end if;
 select coalesce(jsonb_agg(private.employee_purchase_snapshot(q.id) order by q.created_at desc,q.id desc),'[]') into result from (
   select o.id,o.created_at from public.orders o where o.purchase_type='employee' and (p_scope='all' or o.buyer_employee_id=actor)
   and (p_before_created_at is null or (o.created_at,o.id)<(p_before_created_at,p_before_id))
   and (p_state='all' or p_state='pending' and o.paid_at is null and o.employee_cancelled_at is null or p_state='paid' and o.paid_at is not null or p_state='cancelled' and o.employee_cancelled_at is not null)
   order by o.created_at desc,o.id desc limit p_limit+1
 )q;
 return jsonb_build_object('purchases',case when jsonb_array_length(result)>p_limit then result- p_limit else result end,'has_more',jsonb_array_length(result)>p_limit);
end $$;

-- Customer editing/delivery/payment primitives cannot be used to bypass this workflow.
create or replace function private.assert_customer_order(p_row public.orders)
returns void language plpgsql security invoker set search_path='' as $$
begin if p_row.purchase_type<>'customer' then raise exception 'Gestiona la compra personal desde Compras de empleados'; end if; end $$;
do $$ declare sig text; body text; needle text; begin
 foreach sig in array array['private.add_order_item(uuid,uuid,integer,uuid)','private.update_order_item(uuid,integer,text,uuid)','private.confirm_order(uuid,uuid)','private.deliver_item(uuid,public.queue_type,uuid)','private.mark_order_delivered(uuid,uuid)','private.register_payment(uuid,public.payment_method,uuid,text)','private.archive_order(uuid,uuid)','private.edit_order(uuid,bigint,jsonb,uuid)'] loop
   body:=pg_get_functiondef(sig::regprocedure);needle:=case when sig like '%update_order_item%' or sig like '%deliver_item%' then 'row := private.lock_order(parent);' else 'row := private.lock_order(p_order_id);' end;
   if position(needle in body)=0 then raise exception 'P07: revisar definición de % antes de aplicar',sig; end if;
   execute replace(body,needle,needle||E'\n  perform private.assert_customer_order(row);');
 end loop;
end $$;

drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (
 (select private.current_app_role()) in ('admin','staff') or
 (purchase_type='employee' and buyer_employee_id=(select auth.uid()) and (select private.current_app_role()) is not null) or
 (purchase_type='customer' and (select private.current_app_role()) in ('cook','barista') and status in ('confirmado','entregado'))
);
drop policy items_read on public.order_items;
create policy items_read on public.order_items for select to authenticated using (
 (select private.current_app_role()) in ('admin','staff') or exists(select 1 from public.orders o where o.id=order_id and (
  o.purchase_type='employee' and o.buyer_employee_id=(select auth.uid()) and (select private.current_app_role()) is not null or
  o.purchase_type='customer' and o.status in ('confirmado','entregado') and ((select private.current_app_role())='cook' and queue_type='kitchen' or (select private.current_app_role())='barista' and queue_type='cafe')))
);
drop policy payments_read on public.order_payments;
create policy payments_read on public.order_payments for select to authenticated using (
 (select private.current_app_role()) in ('admin','staff') or exists(select 1 from public.orders o where o.id=order_id and o.purchase_type='employee' and o.buyer_employee_id=(select auth.uid()) and (select private.current_app_role()) is not null)
);
-- Personal purchases are handed over when the cashier closes them, without kitchen print jobs.
do $$ declare name text; definition text; begin
 foreach name in array array['v_cafe_queue','v_kitchen_tickets'] loop
  definition:=rtrim(pg_get_viewdef(format('public.%I',name)::regclass,true),E';\n\r ');
  execute format('create or replace view public.%I with(security_invoker=true) as select q.* from (%s) q join public.orders purchase on purchase.id=q.order_id where purchase.purchase_type=''customer''',name,definition);
 end loop;
end $$;
create or replace view public.v_sales_report_line_items with(security_invoker=true) as
select date_trunc('day',coalesce(o.paid_at,o.archived_at,o.created_at))::date as date,oi.item_name as product_or_service,oi.quantity,oi.unit_price,oi.net_total as total_sale_value,
 op.method as payment_method,o.order_number,o.status,o.created_at as order_time,o.purchase_type,o.buyer_employee_id
from public.orders o join public.order_items oi on oi.order_id=o.id left join public.order_payments op on op.order_id=o.id
where o.status in ('pagado','archivado') and oi.status<>'voided' and (select private.current_app_role())='admin';
do $$ declare name text; bucket text; begin
 foreach name in array array['daily','weekly','monthly'] loop
 bucket:=case name when 'daily' then 'date' when 'weekly' then 'date_trunc(''week'',date::timestamp)::date' else 'date_trunc(''month'',date::timestamp)::date' end;
 execute format('create or replace view public.v_sales_report_%I with(security_invoker=true) as select %s as date,product_or_service,sum(quantity)::bigint as quantity,unit_price,sum(total_sale_value) as total_sale_value,payment_method,order_time,purchase_type,buyer_employee_id from public.v_sales_report_line_items group by %s,order_time,product_or_service,unit_price,payment_method,purchase_type,buyer_employee_id',name,bucket,bucket);
 end loop;
end $$;

revoke all on function private.employee_purchase_snapshot(uuid),private.assert_customer_order(public.orders) from public,anon,authenticated;
revoke all on function private.create_employee_purchase(jsonb,uuid),private.checkout_employee_purchase(uuid,public.payment_method,bigint),private.cancel_employee_purchase(uuid,bigint),private.list_employee_purchases(text,timestamptz,uuid,int,text) from public,anon;
grant execute on function private.create_employee_purchase(jsonb,uuid),private.checkout_employee_purchase(uuid,public.payment_method,bigint),private.cancel_employee_purchase(uuid,bigint),private.list_employee_purchases(text,timestamptz,uuid,int,text) to authenticated;
create or replace function public.create_employee_purchase(p_items jsonb,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.create_employee_purchase(p_items,p_request_id) $$;
create or replace function public.checkout_employee_purchase(p_order_id uuid,p_payment_method public.payment_method,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.checkout_employee_purchase(p_order_id,p_payment_method,p_expected_revision) $$;
create or replace function public.cancel_employee_purchase(p_order_id uuid,p_expected_revision bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.cancel_employee_purchase(p_order_id,p_expected_revision) $$;
create or replace function public.list_employee_purchases(p_scope text default 'mine',p_before_created_at timestamptz default null,p_before_id uuid default null,p_limit int default 20,p_state text default 'all') returns jsonb language sql security invoker set search_path='' as $$ select private.list_employee_purchases(p_scope,p_before_created_at,p_before_id,p_limit,p_state) $$;
revoke all on function public.create_employee_purchase(jsonb,uuid),public.checkout_employee_purchase(uuid,public.payment_method,bigint),public.cancel_employee_purchase(uuid,bigint),public.list_employee_purchases(text,timestamptz,uuid,int,text) from public,anon;
grant execute on function public.create_employee_purchase(jsonb,uuid),public.checkout_employee_purchase(uuid,public.payment_method,bigint),public.cancel_employee_purchase(uuid,bigint),public.list_employee_purchases(text,timestamptz,uuid,int,text) to authenticated;
notify pgrst,'reload schema';
