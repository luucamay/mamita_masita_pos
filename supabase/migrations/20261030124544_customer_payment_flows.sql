-- Two customer flows: table/postpaid and takeaway/prepaid. Existing sales are
-- retained; only new prepaid orders use the immutable cash-movement ledger.
alter table public.orders add column payment_methods public.payment_method[];
create table public.order_cash_movements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  request_id uuid not null unique,
  kind text not null check(kind in ('initial','adjustment')),
  method public.payment_method not null check(method in ('cash','qr')),
  amount numeric(12,2) not null,
  lines jsonb not null check(jsonb_typeof(lines)='array'),
  received_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  check(kind<>'initial' or amount>=0)
);
create unique index order_cash_movements_initial_idx on public.order_cash_movements(order_id) where kind='initial';
create index order_cash_movements_period_idx on public.order_cash_movements(recorded_at,order_id);
create index order_cash_movements_order_idx on public.order_cash_movements(order_id);
alter table public.order_cash_movements enable row level security;
revoke all on public.order_cash_movements from public,anon,authenticated;
grant select on public.order_cash_movements to authenticated;
create policy cash_movements_read on public.order_cash_movements for select to authenticated using((select private.current_app_role()) in ('admin','staff'));
create table private.customer_order_requests (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  payload jsonb not null
);
alter table private.customer_order_requests enable row level security;
revoke all on private.customer_order_requests from public,anon,authenticated;
create policy customer_requests_owner on private.customer_order_requests for select to authenticated using(actor_id=(select auth.uid()) and (select private.current_app_role()) in ('admin','staff'));

-- Preserve the validated item implementations for settlement transactions only.
-- API-accessible helpers continue to reject changes to an already paid order.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('private.add_order_item(uuid,uuid,integer,uuid)'::regprocedure);
  execute replace(definition,'FUNCTION private.add_order_item(','FUNCTION private.add_unsettled_item_internal(');
  definition:=pg_get_functiondef('private.update_order_item(uuid,integer,text,uuid)'::regprocedure);
  execute replace(definition,'FUNCTION private.update_order_item(','FUNCTION private.update_unsettled_item_internal(');
end $$;
revoke all on function private.add_unsettled_item_internal(uuid,uuid,integer,uuid),private.update_unsettled_item_internal(uuid,integer,text,uuid) from public,anon,authenticated;
create or replace function private.add_order_item(p_order_id uuid,p_menu_item_id uuid,p_quantity integer,p_created_by uuid default auth.uid())
returns table(order_item_id uuid,order_status public.order_status,queue_type public.queue_type) language plpgsql security definer set search_path='' as $$
declare row public.orders; begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],p_created_by);
  row:=private.lock_order(p_order_id);
  if row.paid_at is not null then raise exception 'Usa la edición con ajuste de cobro'; end if;
  return query select * from private.add_unsettled_item_internal(p_order_id,p_menu_item_id,p_quantity,p_created_by);
end $$;
create or replace function private.update_order_item(p_order_item_id uuid,p_quantity integer default null,p_action text default 'update',p_actor_id uuid default auth.uid())
returns table(order_id uuid,order_item_id uuid,action text) language plpgsql security definer set search_path='' as $$
declare row public.orders; parent uuid; begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],p_actor_id);
  select i.order_id into parent from public.order_items i where i.id=p_order_item_id;
  row:=private.lock_order(parent);
  if row.paid_at is not null then raise exception 'Usa la edición con ajuste de cobro'; end if;
  return query select * from private.update_unsettled_item_internal(p_order_item_id,p_quantity,p_action,p_actor_id);
end $$;

create function private.place_customer_order(p_service text,p_table_number text,p_customer_name text,p_items jsonb,p_expected_date date,p_expected_revision bigint,p_expected_discount_bps integer,p_method public.payment_method,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; payload jsonb; prior private.customer_order_requests; created jsonb; row public.orders; item_lines jsonb;
begin
  actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
  if p_request_id is null or p_service is null or p_service not in ('table','takeaway') or (p_service='takeaway' and (p_method is null or p_method not in ('cash','qr'))) or (p_service='table' and p_method is not null) then raise exception using errcode='22023',message='Servicio o medio de pago inválido'; end if;
  payload:=jsonb_build_object('op','place','service',p_service,'table',p_table_number,'customer',p_customer_name,'items',p_items,'date',p_expected_date,'revision',p_expected_revision,'discount',p_expected_discount_bps,'method',p_method);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into prior from private.customer_order_requests r where r.request_id=p_request_id;
  if found then
    if prior.actor_id<>actor or prior.payload<>payload then raise exception using errcode='22023',message='Operación reutilizada con otros datos'; end if;
    return jsonb_build_object('order_id',prior.order_id,'snapshot',private.order_snapshot(prior.order_id));
  end if;
  if p_service='table' and (nullif(btrim(p_table_number),'') is null or lower(btrim(p_table_number)) in ('para llevar','llevar')) then raise exception 'Indica la mesa'; end if;
  created:=private.create_order_with_promotion(case when p_service='takeaway' then 'Para llevar' else p_table_number end,p_customer_name,p_items,p_expected_date,p_expected_revision,p_expected_discount_bps);
  row:=private.lock_order((created->>'order_id')::uuid);
  if p_service='takeaway' then
    insert into public.order_payments(order_id,method,amount,received_by) values(row.id,p_method,row.total,actor);
    update public.orders set paid_at=now(),paid_by=actor,payment_method=p_method,payment_methods=array[p_method] where id=row.id;
    select coalesce(jsonb_agg(jsonb_build_object('menu_item_id',i.menu_item_id,'item_name',i.item_name,'quantity',i.quantity,'unit_price',i.unit_price,'net_total',i.net_total)),'[]'::jsonb) into item_lines from public.order_items i where i.order_id=row.id and i.status<>'voided';
    insert into public.order_cash_movements(order_id,request_id,kind,method,amount,lines,received_by) values(row.id,p_request_id,'initial',p_method,row.total,item_lines,actor);
    insert into public.order_events(order_id,actor_id,event_type,payload) values(row.id,actor,'takeaway_paid',jsonb_build_object('method',p_method,'amount',row.total,'request_id',p_request_id));
  end if;
  insert into private.customer_order_requests values(p_request_id,actor,row.id,payload);
  return jsonb_build_object('order_id',row.id,'snapshot',private.order_snapshot(row.id));
end $$;
create function public.place_customer_order(p_service text,p_table_number text,p_customer_name text,p_items jsonb,p_expected_date date,p_expected_revision bigint,p_expected_discount_bps integer,p_method public.payment_method,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.place_customer_order($1,$2,$3,$4,$5,$6,$7,$8,$9) $$;
revoke all on function private.place_customer_order(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid),public.place_customer_order(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid) from public,anon;
grant execute on function private.place_customer_order(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid),public.place_customer_order(text,text,text,jsonb,date,bigint,integer,public.payment_method,uuid) to authenticated;

create function private.edit_prepaid_order(p_order_id uuid,p_expected_revision bigint,p_changes jsonb,p_method public.payment_method,p_expected_delta numeric,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; row public.orders; prior private.customer_order_requests; payload jsonb; entry jsonb; line public.order_items; price numeric; before_lines jsonb; delta numeric; delta_lines jsonb; chosen public.payment_method;
begin
  actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
  if p_request_id is null or p_expected_revision is null or p_expected_delta is null or p_changes is null or jsonb_typeof(p_changes)<>'array' then raise exception using errcode='22023',message='Faltan datos del ajuste'; end if;
  if jsonb_array_length(p_changes) not between 1 and 100 then raise exception using errcode='22023',message='Cambios inválidos'; end if;
  payload:=jsonb_build_object('op','adjust','order',p_order_id,'revision',p_expected_revision,'changes',p_changes,'method',p_method,'delta',p_expected_delta);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  row:=private.lock_order(p_order_id);
  select * into prior from private.customer_order_requests r where r.request_id=p_request_id;
  if found then
    if prior.actor_id<>actor or prior.order_id<>p_order_id or prior.payload<>payload then raise exception using errcode='22023',message='Operación reutilizada con otros datos'; end if;
    return private.order_snapshot(p_order_id);
  end if;
  if row.purchase_type<>'customer' or row.paid_at is null or row.status not in ('confirmado','entregado') or row.delivered_at is not null or not exists(select 1 from public.order_cash_movements m where m.order_id=row.id and m.kind='initial') then raise exception 'Este pedido no admite ajustes'; end if;
  if row.revision<>p_expected_revision then raise exception using errcode='40001',message='El pedido cambió. Recarga antes de guardar'; end if;
  if exists(select 1 from jsonb_array_elements(p_changes)e where e->>'action' in ('update','remove') group by e->>'order_item_id' having count(*)>1) then raise exception using errcode='22023',message='Producto repetido'; end if;
  select jsonb_agg(to_jsonb(i)) into before_lines from public.order_items i where i.order_id=p_order_id;
  for entry in select value from jsonb_array_elements(p_changes) loop
    if entry->>'action' is null or entry->>'action' not in ('add','update','remove') or (entry->>'action'<>'remove' and coalesce(entry->>'quantity','')!~'^[1-9][0-9]{0,2}$') then raise exception using errcode='22023',message='Cambio inválido'; end if;
    if entry->>'action'='add' then
      select mi.price into price from public.menu_items mi join public.categories c on c.id=mi.category_id where mi.id=(entry->>'menu_item_id')::uuid and mi.active and c.active for share of mi,c;
      if not found or entry->>'expected_unit_price' is null or price is distinct from (entry->>'expected_unit_price')::numeric then raise exception using errcode='40001',message='El producto o precio cambió'; end if;
      perform private.add_unsettled_item_internal(p_order_id,(entry->>'menu_item_id')::uuid,(entry->>'quantity')::integer,actor);
    else
      select * into line from public.order_items i where i.id=(entry->>'order_item_id')::uuid and i.order_id=p_order_id;
      if not found then raise exception 'Producto ajeno al pedido'; end if;
      perform private.update_unsettled_item_internal(line.id,case when entry->>'action'='remove' then null else (entry->>'quantity')::integer end,entry->>'action',actor);
    end if;
  end loop;
  if not exists(select 1 from public.order_items i where i.order_id=p_order_id and i.status<>'voided') then raise exception 'Conserva al menos un producto'; end if;
  select o.total-row.total into delta from public.orders o where o.id=p_order_id;
  if delta is distinct from p_expected_delta then raise exception using errcode='40001',message='La diferencia cambió. Revisa el cobro o devolución'; end if;
  chosen:=coalesce(p_method,row.payment_method);
  if chosen is null or chosen not in ('cash','qr') or (delta<>0 and p_method is null) then raise exception using errcode='22023',message='Indica Efectivo o QR para el ajuste'; end if;
  with previous as (select * from jsonb_to_recordset(before_lines) as b(id uuid,quantity integer,status text,net_total numeric)), differences as (
    select i.menu_item_id,i.item_name,i.unit_price,(case when i.status='voided' then 0 else i.quantity end)-coalesce(case when b.status='voided' then 0 else b.quantity end,0) as quantity,
      i.net_total-coalesce(b.net_total,0) as net_total from public.order_items i left join previous b on b.id=i.id where i.order_id=p_order_id
  ) select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into delta_lines from differences d where quantity<>0 or net_total<>0;
  if coalesce((select sum((e->>'net_total')::numeric) from jsonb_array_elements(delta_lines)e),0)<>delta then raise exception 'El ajuste no concilia'; end if;
  insert into public.order_cash_movements(order_id,request_id,kind,method,amount,lines,received_by) values(p_order_id,p_request_id,'adjustment',chosen,delta,delta_lines,actor);
  if (select sum(m.amount) from public.order_cash_movements m where m.order_id=p_order_id)<>(select o.total from public.orders o where o.id=p_order_id) then raise exception 'El cobro no concilia con el pedido'; end if;
  update public.orders set payment_methods=(select array_agg(distinct m.method order by m.method) from public.order_cash_movements m where m.order_id=p_order_id) where id=p_order_id;
  perform private.confirm_order(p_order_id,actor);
  insert into private.customer_order_requests values(p_request_id,actor,p_order_id,payload);
  insert into public.order_events(order_id,actor_id,event_type,payload) values(p_order_id,actor,'paid_order_adjusted',jsonb_build_object('delta',delta,'method',chosen,'request_id',p_request_id));
  return private.order_snapshot(p_order_id);
end $$;
create function public.edit_prepaid_order(p_order_id uuid,p_expected_revision bigint,p_changes jsonb,p_method public.payment_method,p_expected_delta numeric,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.edit_prepaid_order($1,$2,$3,$4,$5,$6) $$;
revoke all on function private.edit_prepaid_order(uuid,bigint,jsonb,public.payment_method,numeric,uuid),public.edit_prepaid_order(uuid,bigint,jsonb,public.payment_method,numeric,uuid) from public,anon;
grant execute on function private.edit_prepaid_order(uuid,bigint,jsonb,public.payment_method,numeric,uuid),public.edit_prepaid_order(uuid,bigint,jsonb,public.payment_method,numeric,uuid) to authenticated;

create function private.deliver_prepaid_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; row public.orders;
begin
  actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());row:=private.lock_order(p_order_id);
  if row.purchase_type<>'customer' or row.paid_at is null or not exists(select 1 from public.order_cash_movements m where m.order_id=p_order_id and m.kind='initial') then raise exception 'El pedido no está cobrado para llevar'; end if;
  if row.status='archivado' then return private.order_snapshot(p_order_id); end if;
  if (select sum(m.amount) from public.order_cash_movements m where m.order_id=p_order_id)<>row.total then raise exception 'El cobro no concilia'; end if;
  perform private.mark_order_delivered(p_order_id,actor);
  update public.orders set status='archivado',archived_at=now() where id=p_order_id;
  insert into public.order_events(order_id,actor_id,event_type) values(p_order_id,actor,'prepaid_order_archived');
  return private.order_snapshot(p_order_id);
end $$;
create function public.deliver_prepaid_order(p_order_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.deliver_prepaid_order($1) $$;
revoke all on function private.deliver_prepaid_order(uuid),public.deliver_prepaid_order(uuid) from public,anon;
grant execute on function private.deliver_prepaid_order(uuid),public.deliver_prepaid_order(uuid) to authenticated;
notify pgrst,'reload schema';

-- Cash-flow reports include prepaid orders immediately and retain refund dates.
create or replace function public.get_sales_report(p_period text default 'daily',p_date date default null,p_payment_filter text default 'all',p_purchase_filter text default 'all')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare anchor date:=coalesce(p_date,(current_timestamp at time zone 'America/La_Paz')::date); first_day date; after_day date; result jsonb;
begin
 if (select private.current_app_role()) is distinct from 'admin'::public.user_role then raise exception using errcode='42501',message='Solo Administración puede consultar reportes'; end if;
 if p_period is null or p_period not in ('daily','weekly','monthly') or p_payment_filter is null or p_payment_filter not in ('all','cash','qr','other') or p_purchase_filter is null or p_purchase_filter not in ('all','customer','employee') or anchor not between date '2000-01-01' and date '2099-12-31' then raise exception using errcode='22023',message='Filtros de reporte inválidos'; end if;
 first_day:=case p_period when 'daily' then anchor when 'weekly' then date_trunc('week',anchor::timestamp)::date else date_trunc('month',anchor::timestamp)::date end;
 after_day:=case p_period when 'daily' then first_day+1 when 'weekly' then first_day+7 else (first_day+interval '1 month')::date end;
 with paid as materialized (
  select o.id,o.purchase_type,p.method,p.amount,null::uuid as movement_id from public.order_payments p join public.orders o on o.id=p.order_id
  where p.paid_at >= (first_day::timestamp at time zone 'America/La_Paz') and p.paid_at < (after_day::timestamp at time zone 'America/La_Paz')
   and o.status in ('pagado','archivado') and o.employee_cancelled_at is null and (p_purchase_filter='all' or o.purchase_type=p_purchase_filter)
   and not exists(select 1 from public.order_cash_movements m where m.order_id=o.id and m.kind='initial')
  union all
  select o.id,o.purchase_type,m.method,m.amount,m.id from public.order_cash_movements m join public.orders o on o.id=m.order_id
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
  'rows',coalesce((select jsonb_agg(jsonb_build_object('date',first_day,'menu_item_id',menu_item_id,'product_or_service',item_name,'quantity',quantity,'unit_price',unit_price,'total_sale_value',total_sale_value,'payment_method',method,'purchase_type',purchase_type) order by item_name,menu_item_id,method,purchase_type) from grouped),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.get_sales_report(text,date,text,text) from public,anon;
grant execute on function public.get_sales_report(text,date,text,text) to authenticated;
notify pgrst,'reload schema';
