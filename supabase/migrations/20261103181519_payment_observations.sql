-- Optional notes are part of the receipt transaction. Existing callers and
-- historical receipts remain valid; no financial amounts or shifts are backfilled.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.order_payments add column observation text not null default '' check(length(observation)<=500);
alter table public.order_cash_movements add column observation text not null default '' check(length(observation)<=500);

-- Internal only. Called after the validated payment, while its locks are held.
-- A retry must carry the original note; it cannot rewrite a receipt or a closed cut.
create function private.attach_receipt_observation(p_order uuid,p_note text,p_existing boolean,p_request uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare receipt public.order_cash_movements; payment public.order_payments;
begin
 if p_request is not null then
  select * into strict receipt from public.order_cash_movements where order_id=p_order and request_id=p_request;
  if p_existing and receipt.observation<>p_note then raise exception using errcode='22023',message='El cobro ya tiene otra observación. Actualiza el pedido'; end if;
  if not p_existing then update public.order_cash_movements set observation=p_note where id=receipt.id; end if;
 end if;
 if p_request is null or receipt.kind='initial' then
  select * into strict payment from public.order_payments where order_id=p_order;
  if p_existing and payment.observation<>p_note then raise exception using errcode='22023',message='El cobro ya tiene otra observación. Actualiza el pedido'; end if;
  if not p_existing then update public.order_payments set observation=p_note where id=payment.id; end if;
 end if;
end $$;
revoke all on function private.attach_receipt_observation(uuid,text,boolean,uuid) from public,anon,authenticated,service_role;

create function private.checkout_order_with_observation(p_order_id uuid,p_payment_method public.payment_method,p_received_by uuid,p_observation text)
returns table(payment_id uuid,order_id uuid,status public.order_status) language plpgsql security definer set search_path='' as $$
declare note text:=btrim(coalesce(p_observation,'')); existed boolean; result record;
begin
 perform private.assert_actor(array['admin','staff']::public.user_role[],p_received_by);
 if length(note)>500 then raise exception using errcode='22023',message='La observación admite hasta 500 caracteres'; end if;
 perform private.lock_order(p_order_id);
 existed:=exists(select 1 from public.order_payments p where p.order_id=p_order_id);
 select * into result from private.checkout_order(p_order_id,p_payment_method,p_received_by,null);
 perform private.attach_receipt_observation(p_order_id,note,existed);
 return query select result.payment_id,result.order_id,result.status;
end $$;
create function public.checkout_order_with_observation(p_order_id uuid,p_payment_method public.payment_method,p_received_by uuid,p_observation text)
returns table(payment_id uuid,order_id uuid,status public.order_status) language sql security invoker set search_path='' as $$select * from private.checkout_order_with_observation($1,$2,$3,$4)$$;

create function private.checkout_employee_purchase_with_observation(p_order_id uuid,p_payment_method public.payment_method,p_expected_revision bigint,p_observation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare note text:=btrim(coalesce(p_observation,'')); existed boolean; result jsonb;
begin
 perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if length(note)>500 then raise exception using errcode='22023',message='La observación admite hasta 500 caracteres'; end if;
 perform private.lock_order(p_order_id);
 existed:=exists(select 1 from public.order_payments p where p.order_id=p_order_id);
 result:=private.checkout_employee_purchase(p_order_id,p_payment_method,p_expected_revision);
 perform private.attach_receipt_observation(p_order_id,note,existed);
 return result;
end $$;
create function public.checkout_employee_purchase_with_observation(p_order_id uuid,p_payment_method public.payment_method,p_expected_revision bigint,p_observation text)
returns jsonb language sql security invoker set search_path='' as $$select private.checkout_employee_purchase_with_observation($1,$2,$3,$4)$$;

create function private.place_customer_order_with_observation(p_service text,p_table_number text,p_customer_name text,p_items jsonb,p_expected_date date,p_expected_revision bigint,p_expected_discount_bps integer,p_method public.payment_method,p_request_id uuid,p_observation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare note text:=btrim(coalesce(p_observation,'')); existed boolean; result jsonb;
begin
 perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if length(note)>500 or p_service is distinct from 'takeaway' then raise exception using errcode='22023',message='La observación del cobro es para llevar y admite hasta 500 caracteres'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 existed:=exists(select 1 from private.customer_order_requests r where r.request_id=p_request_id);
 result:=private.place_customer_order(p_service,p_table_number,p_customer_name,p_items,p_expected_date,p_expected_revision,p_expected_discount_bps,p_method,p_request_id);
 perform private.attach_receipt_observation((result->>'order_id')::uuid,note,existed,p_request_id);
 return result;
end $$;
create function public.place_customer_order_with_observation(p_service text,p_table_number text,p_customer_name text,p_items jsonb,p_expected_date date,p_expected_revision bigint,p_expected_discount_bps integer,p_method public.payment_method,p_request_id uuid,p_observation text)
returns jsonb language sql security invoker set search_path='' as $$select private.place_customer_order_with_observation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)$$;

create function private.edit_prepaid_order_with_observation(p_order_id uuid,p_expected_revision bigint,p_changes jsonb,p_method public.payment_method,p_expected_delta numeric,p_request_id uuid,p_observation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare note text:=btrim(coalesce(p_observation,'')); existed boolean; result jsonb;
begin
 perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if length(note)>500 then raise exception using errcode='22023',message='La observación admite hasta 500 caracteres'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 perform private.lock_order(p_order_id);
 existed:=exists(select 1 from private.customer_order_requests r where r.request_id=p_request_id);
 result:=private.edit_prepaid_order(p_order_id,p_expected_revision,p_changes,p_method,p_expected_delta,p_request_id);
 perform private.attach_receipt_observation(p_order_id,note,existed,p_request_id);
 return result;
end $$;
create function public.edit_prepaid_order_with_observation(p_order_id uuid,p_expected_revision bigint,p_changes jsonb,p_method public.payment_method,p_expected_delta numeric,p_request_id uuid,p_observation text)
returns jsonb language sql security invoker set search_path='' as $$select private.edit_prepaid_order_with_observation($1,$2,$3,$4,$5,$6,$7)$$;

revoke all on function private.checkout_order_with_observation(uuid,public.payment_method,uuid,text),public.checkout_order_with_observation(uuid,public.payment_method,uuid,text),private.checkout_employee_purchase_with_observation(uuid,public.payment_method,bigint,text),public.checkout_employee_purchase_with_observation(uuid,public.payment_method,bigint,text),private.place_customer_order_with_observation(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid,text),public.place_customer_order_with_observation(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid,text),private.edit_prepaid_order_with_observation(uuid,bigint,jsonb,public.payment_method,numeric,uuid,text),public.edit_prepaid_order_with_observation(uuid,bigint,jsonb,public.payment_method,numeric,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.checkout_order_with_observation(uuid,public.payment_method,uuid,text),public.checkout_order_with_observation(uuid,public.payment_method,uuid,text),private.checkout_employee_purchase_with_observation(uuid,public.payment_method,bigint,text),public.checkout_employee_purchase_with_observation(uuid,public.payment_method,bigint,text),private.place_customer_order_with_observation(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid,text),public.place_customer_order_with_observation(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid,text),private.edit_prepaid_order_with_observation(uuid,bigint,jsonb,public.payment_method,numeric,uuid,text),public.edit_prepaid_order_with_observation(uuid,bigint,jsonb,public.payment_method,numeric,uuid,text) to authenticated;

-- Open drawers use the receipt note. close_cashbox_shift already freezes this
-- complete JSON in closing_snapshot and includes it in the concurrency digest.
create or replace function private.cash_receipts(p_shift uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with receipts as (
  select 'payment' as source_kind,p.id,p.order_id,p.method,p.amount,p.received_by,p.paid_at as recorded_at,'initial' as kind,p.observation
  from private.cash_shift_receipts r join public.order_payments p on p.id=r.payment_id where r.shift_id=p_shift
  and not exists(select 1 from public.order_cash_movements m where m.order_id=p.order_id and m.kind='initial')
  union all
  select 'movement',m.id,m.order_id,m.method,m.amount,m.received_by,m.recorded_at,m.kind,m.observation
  from private.cash_shift_receipts r join public.order_cash_movements m on m.id=r.movement_id where r.shift_id=p_shift
 ) select coalesce(jsonb_agg(jsonb_build_object('source_kind',r.source_kind,'source_id',r.id,'order_id',r.order_id,'order_number',o.order_number,
  'recorded_at',r.recorded_at,'method',r.method,'amount',r.amount,'kind',r.kind,'received_by',r.received_by,'receiver_name',coalesce(p.full_name,'Sin nombre'),'purchase_type',o.purchase_type,'observation',r.observation)
  order by r.recorded_at,r.id,r.source_kind),'[]'::jsonb)
 from receipts r join public.orders o on o.id=r.order_id left join public.profiles p on p.id=r.received_by;
$$;

-- Notes follow the exact receipt dates and filters of the sales detail.
create or replace function public.get_sales_report(p_period text default 'daily',p_date date default null,p_payment_filter text default 'all',p_purchase_filter text default 'all')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare anchor date:=coalesce(p_date,(current_timestamp at time zone 'America/La_Paz')::date); first_day date; after_day date; result jsonb;
begin
 if (select private.current_app_role()) is distinct from 'admin'::public.user_role then raise exception using errcode='42501',message='Solo Administración puede consultar reportes'; end if;
 if p_period is null or p_period not in ('daily','weekly','monthly') or p_payment_filter is null or p_payment_filter not in ('all','cash','qr','other') or p_purchase_filter is null or p_purchase_filter not in ('all','customer','employee') or anchor not between date '2000-01-01' and date '2099-12-31' then raise exception using errcode='22023',message='Filtros de reporte inválidos'; end if;
 first_day:=case p_period when 'daily' then anchor when 'weekly' then date_trunc('week',anchor::timestamp)::date else date_trunc('month',anchor::timestamp)::date end;
 after_day:=case p_period when 'daily' then first_day+1 when 'weekly' then first_day+7 else (first_day+interval '1 month')::date end;
 with paid as materialized (
  select o.id,o.purchase_type,p.method,p.amount,null::uuid as movement_id,p.id as receipt_id,p.paid_at as recorded_at,p.observation,p.received_by,'initial'::text as kind from public.order_payments p join public.orders o on o.id=p.order_id
  where p.paid_at >= (first_day::timestamp at time zone 'America/La_Paz') and p.paid_at < (after_day::timestamp at time zone 'America/La_Paz')
   and o.status in ('pagado','archivado') and o.employee_cancelled_at is null and (p_purchase_filter='all' or o.purchase_type=p_purchase_filter)
   and not exists(select 1 from public.order_cash_movements m where m.order_id=o.id and m.kind='initial')
  union all
  select o.id,o.purchase_type,m.method,m.amount,m.id,m.id,m.recorded_at,m.observation,m.received_by,m.kind from public.order_cash_movements m join public.orders o on o.id=m.order_id
  where m.recorded_at >= (first_day::timestamp at time zone 'America/La_Paz') and m.recorded_at < (after_day::timestamp at time zone 'America/La_Paz')
   and o.employee_cancelled_at is null and (p_purchase_filter='all' or o.purchase_type=p_purchase_filter)
 ), lines as materialized (
  select i.menu_item_id,i.item_name,i.quantity,i.unit_price,i.net_total,p.method,p.purchase_type from paid p join public.order_items i on i.order_id=p.id where p.movement_id is null and i.status<>'voided'
  union all
  select (entry->>'menu_item_id')::uuid,entry->>'item_name',(entry->>'quantity')::integer,(entry->>'unit_price')::numeric,(entry->>'net_total')::numeric,p.method,p.purchase_type
  from paid p join public.order_cash_movements m on m.id=p.movement_id cross join lateral jsonb_array_elements(m.lines) entry
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
  'summary',jsonb_build_object('total',coalesce((select sum(amount) from paid),0),'orders',(select count(distinct id) from paid),'units',coalesce((select sum(quantity) from lines),0),
   'cash',jsonb_build_object('amount',coalesce((select sum(amount) from paid where method='cash'),0),'orders',(select count(distinct id) from paid where method='cash')),
   'qr',jsonb_build_object('amount',coalesce((select sum(amount) from paid where method='qr'),0),'orders',(select count(distinct id) from paid where method='qr')),
   'other',jsonb_build_object('amount',coalesce((select sum(amount) from paid where method not in ('cash','qr')),0),'orders',(select count(distinct id) from paid where method not in ('cash','qr')))),
  'filtered',jsonb_build_object('total',coalesce((select sum(amount) from filtered_paid),0),'orders',(select count(distinct id) from filtered_paid),'units',coalesce((select sum(quantity) from filtered_lines),0)),
  'observations',coalesce((select jsonb_agg(jsonb_build_object('source_kind',case when f.movement_id is null then 'payment' else 'movement' end,'source_id',f.receipt_id,'order_id',f.id,'order_number',o.order_number,'recorded_at',f.recorded_at,'method',f.method,'amount',f.amount,'kind',f.kind,'received_by',f.received_by,'receiver_name',coalesce(p.full_name,'Sin nombre'),'purchase_type',f.purchase_type,'observation',f.observation) order by f.recorded_at desc,f.receipt_id) from filtered_paid f join public.orders o on o.id=f.id left join public.profiles p on p.id=f.received_by where f.observation<>''),'[]'::jsonb),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('date',first_day,'menu_item_id',menu_item_id,'product_or_service',item_name,'quantity',quantity,'unit_price',unit_price,'total_sale_value',total_sale_value,'payment_method',method,'purchase_type',purchase_type) order by item_name,menu_item_id,method,purchase_type) from grouped),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.get_sales_report(text,date,text,text) from public,anon;
grant execute on function public.get_sales_report(text,date,text,text) to authenticated;
notify pgrst,'reload schema';
