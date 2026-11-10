set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.cash_shift_operational_end(p_shift public.cash_shifts)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select coalesce(p_shift.scheduled_end_at, (plan->>'ends_at')::timestamptz)
    + case when coalesce(p_shift.shift_slot, plan->>'slot') in ('morning', 'afternoon')
        then interval '1 hour' else interval '0' end
  from (select private.cash_schedule(p_shift.opened_at) as plan) as schedule;
$$;

-- Each payment leg is a real receipt. Keep the existing single-payment API and
-- cash-shift capture triggers, and allow one initial leg per method per order.
create unique index order_payments_order_method_idx on public.order_payments(order_id, method);
drop index public.order_payments_one_per_order_idx;
create unique index order_cash_movements_initial_method_idx on public.order_cash_movements(order_id, method)
  where kind = 'initial';
drop index public.order_cash_movements_initial_idx;

create or replace function private.archive_order(p_order_id uuid, p_archived_by uuid default auth.uid())
returns table(order_id uuid, status public.order_status)
language plpgsql security definer set search_path = '' as $$
declare uid uuid; row public.orders;
begin
  uid := private.assert_actor(array['admin','staff']::public.user_role[], p_archived_by);
  row := private.lock_order(p_order_id);
  if row.status not in ('pagado','archivado')
    or not exists(select 1 from public.order_payments p where p.order_id = p_order_id and p.method = row.payment_method)
    or (select sum(p.amount) from public.order_payments p where p.order_id = p_order_id) is distinct from row.total
  then raise exception 'El pedido requiere un pago válido antes de archivarse'; end if;
  if row.status = 'archivado' then return query select p_order_id, row.status; return; end if;
  update public.orders set status = 'archivado', archived_at = now() where id = p_order_id;
  insert into public.order_events(order_id, actor_id, event_type) values(p_order_id, uid, 'order_archived');
  return query select p_order_id, 'archivado'::public.order_status;
end $$;

create function private.validate_split_amounts(p_cash numeric, p_qr numeric, p_note text)
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_cash is null or p_qr is null or not (p_cash between 0.01 and 99999999.99)
    or not (p_qr between 0.01 and 99999999.99) or round(p_cash,2) <> p_cash or round(p_qr,2) <> p_qr
  then raise exception using errcode='22023', message='Indica montos positivos de Efectivo y QR con hasta dos decimales'; end if;
  if length(p_note) > 500 then
    raise exception using errcode='22023', message='La observación admite hasta 500 caracteres';
  end if;
end $$;

-- Called after the original checkout validates the order and writes the initial
-- cash receipt, with the order and register locks held in the same transaction.
create function private.split_initial_payment(p_order uuid, p_cash numeric, p_qr numeric, p_note text)
returns void language plpgsql security invoker set search_path = '' as $$
declare initial public.order_payments;
begin
  select * into strict initial from public.order_payments p where p.order_id = p_order and p.method = 'cash';
  if initial.amount <> p_cash + p_qr then
    raise exception using errcode='40001', message='El total cambió. Actualiza el pedido y revisa los montos del cobro mixto';
  end if;
  update public.order_payments set amount = p_cash, observation = p_note where id = initial.id;
  insert into public.order_payments(order_id, method, amount, received_by, paid_at, observation)
    values(p_order, 'qr', p_qr, initial.received_by, initial.paid_at, p_note);
  update public.orders set payment_methods = array['cash','qr']::public.payment_method[] where id = p_order;
  insert into public.order_events(order_id, actor_id, event_type, payload)
    values(p_order, initial.received_by, 'order_payment_split', jsonb_build_object('cash', p_cash, 'qr', p_qr));
end $$;

create function private.checkout_split_payment(p_order_id uuid, p_cash numeric, p_qr numeric, p_observation text, p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; row public.orders; note text := btrim(coalesce(p_observation, ''));
begin
  actor := private.assert_actor(array['admin','staff']::public.user_role[], auth.uid());
  perform private.validate_split_amounts(p_cash, p_qr, note);
  row := private.lock_order(p_order_id);
  if (row.purchase_type = 'employee') <> (p_expected_revision is not null)
    or exists (select 1 from public.order_cash_movements m where m.order_id = p_order_id and m.kind = 'initial') then
    raise exception using errcode='22023', message='Este pedido requiere su propio flujo de cobro';
  end if;

  if row.paid_at is not null then
    if row.status <> 'archivado' or row.total <> p_cash + p_qr or
      (select count(*) from public.order_payments p where p.order_id = p_order_id and p.observation = note
       and ((p.method = 'cash' and p.amount = p_cash) or (p.method = 'qr' and p.amount = p_qr))) <> 2 then
      raise exception 'El pedido ya tiene un pago diferente';
    end if;
  else
    if row.purchase_type = 'employee' then
      perform private.checkout_employee_purchase(p_order_id, 'cash', p_expected_revision);
    else
      perform private.checkout_order(p_order_id, 'cash', actor, null);
    end if;
    perform private.split_initial_payment(p_order_id, p_cash, p_qr, note);
  end if;

  if row.purchase_type = 'employee' then return private.employee_purchase_snapshot(p_order_id); end if;
  return private.order_snapshot(p_order_id);
end $$;

create function public.checkout_split_payment(
  p_order_id uuid, p_cash numeric, p_qr numeric, p_observation text default '', p_expected_revision bigint default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.checkout_split_payment($1,$2,$3,$4,$5);
$$;

create function private.place_takeaway_split_payment(
  p_customer_name text, p_items jsonb, p_expected_date date, p_expected_revision bigint,
  p_expected_discount_bps integer, p_request_id uuid, p_cash numeric, p_qr numeric, p_observation text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid; order_id uuid; prior private.customer_order_requests;
  note text := btrim(coalesce(p_observation, '')); request_payload jsonb; initial public.order_cash_movements;
begin
  actor := private.assert_actor(array['admin','staff']::public.user_role[], auth.uid());
  perform private.validate_split_amounts(p_cash, p_qr, note);
  if p_request_id is null then raise exception using errcode='22023', message='Falta la referencia del pedido'; end if;
  request_payload := jsonb_build_object('op','place_split','customer',p_customer_name,'items',p_items,
    'date',p_expected_date,'revision',p_expected_revision,'discount',p_expected_discount_bps,
    'cash',p_cash,'qr',p_qr,'note',note);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into prior from private.customer_order_requests r where r.request_id = p_request_id;
  if found then
    if prior.actor_id <> actor or prior.payload <> request_payload then
      raise exception using errcode='22023', message='Operación reutilizada con otros datos';
    end if;
    return jsonb_build_object('order_id', prior.order_id, 'snapshot', private.order_snapshot(prior.order_id));
  end if;

  order_id := (private.place_customer_order('takeaway','Para llevar',p_customer_name,p_items,
    p_expected_date,p_expected_revision,p_expected_discount_bps,'cash',p_request_id)->>'order_id')::uuid;
  perform private.split_initial_payment(order_id, p_cash, p_qr, note);
  select * into strict initial from public.order_cash_movements m where m.request_id = p_request_id;
  update public.order_cash_movements set amount = p_cash, observation = note where id = initial.id;
  -- Store the item snapshot on the first leg only. Reports use it for both tenders.
  insert into public.order_cash_movements(order_id,request_id,kind,method,amount,lines,received_by,recorded_at,observation)
    values(order_id,gen_random_uuid(),'initial','qr',p_qr,'[]',actor,initial.recorded_at,note);
  update private.customer_order_requests set payload = request_payload where request_id = p_request_id;
  return jsonb_build_object('order_id', order_id, 'snapshot', private.order_snapshot(order_id));
end $$;

create function public.place_takeaway_split_payment(
  p_customer_name text, p_items jsonb, p_expected_date date, p_expected_revision bigint,
  p_expected_discount_bps integer, p_request_id uuid, p_cash numeric, p_qr numeric, p_observation text default ''
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.place_takeaway_split_payment($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;

revoke all on function private.validate_split_amounts(numeric,numeric,text), private.split_initial_payment(uuid,numeric,numeric,text)
  from public, anon, authenticated, service_role;
revoke all on function private.checkout_split_payment(uuid,numeric,numeric,text,bigint),
  public.checkout_split_payment(uuid,numeric,numeric,text,bigint),
  private.place_takeaway_split_payment(text,jsonb,date,bigint,integer,uuid,numeric,numeric,text),
  public.place_takeaway_split_payment(text,jsonb,date,bigint,integer,uuid,numeric,numeric,text)
  from public, anon, authenticated, service_role;
grant execute on function private.checkout_split_payment(uuid,numeric,numeric,text,bigint),
  public.checkout_split_payment(uuid,numeric,numeric,text,bigint),
  private.place_takeaway_split_payment(text,jsonb,date,bigint,integer,uuid,numeric,numeric,text),
  public.place_takeaway_split_payment(text,jsonb,date,bigint,integer,uuid,numeric,numeric,text) to authenticated;

-- Retain the legacy view's one-row-per-item contract and enum column.
create or replace view public.v_sales_report_line_items with(security_invoker=true) as
select date_trunc('day',coalesce(o.paid_at,o.archived_at,o.created_at))::date as date,
 oi.item_name as product_or_service,oi.quantity,oi.unit_price,oi.net_total as total_sale_value,
 op.method as payment_method,o.order_number,o.status,o.created_at as order_time,o.purchase_type,o.buyer_employee_id
from public.orders o join public.order_items oi on oi.order_id=o.id
left join lateral (
 select p.method from public.order_payments p where p.order_id=o.id
 order by (p.method is not distinct from o.payment_method) desc,p.method limit 1
) op on true
where o.status in ('pagado','archivado') and oi.status<>'voided' and (select private.current_app_role())='admin';

-- The cash totals count both legs. Product quantities count each line once.
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
 ), split_payments as (
  select id, sum(amount) filter (where method='cash') as cash_amount, sum(amount) as total
  from paid where kind='initial' group by id having count(*)=2 and bool_or(method='cash') and bool_or(method='qr')
 ), product_lines as (
  select p.receipt_id,i.id::text as line_key,i.menu_item_id,i.item_name,i.quantity,i.unit_price,i.net_total,p.method,p.purchase_type,s.cash_amount,s.total
  from paid p join public.order_items i on i.order_id=p.id
  left join split_payments s on s.id=p.id and p.kind='initial'
  where p.movement_id is null and i.status<>'voided' and (s.id is null or p.method='cash')
  union all
  select p.receipt_id,entry.position::text,(entry.value->>'menu_item_id')::uuid,entry.value->>'item_name',(entry.value->>'quantity')::integer,
   (entry.value->>'unit_price')::numeric,(entry.value->>'net_total')::numeric,p.method,p.purchase_type,s.cash_amount,s.total
  from paid p join public.order_cash_movements m on m.id=p.movement_id
  cross join lateral jsonb_array_elements(m.lines) with ordinality as entry(value,position)
  left join split_payments s on s.id=p.id and p.kind='initial'
  where s.id is null or p.method='cash'
 ), allocated as (
  -- Round cumulative shares so cash and QR each reconcile to the cent.
  select *,sum(net_total) over(partition by receipt_id order by line_key rows unbounded preceding) as running_total
  from product_lines
 ), lines as materialized (
  select *, case when cash_amount is not null then
    round(running_total*cash_amount/total,2)-round((running_total-net_total)*cash_amount/total,2)
   end as line_cash
  from allocated
 ), filtered_paid as materialized (
  select * from paid where p_payment_filter='all' or method::text=p_payment_filter or p_payment_filter='other' and method not in ('cash','qr')
 ), filtered_lines as (
  select menu_item_id,item_name,quantity,unit_price,purchase_type,
   case when cash_amount is null then method::text when p_payment_filter='all' then 'mixed' else p_payment_filter end as method,
   case when cash_amount is null or p_payment_filter='all' then net_total
        when p_payment_filter='cash' then line_cash else net_total-line_cash end as net_total
  from lines where p_payment_filter='all'
    or cash_amount is not null and p_payment_filter in ('cash','qr')
    or cash_amount is null and (method::text=p_payment_filter or p_payment_filter='other' and method not in ('cash','qr'))
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
