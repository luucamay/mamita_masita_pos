-- Use collection time after quote/row locks, not transaction-start time.
alter table public.order_cash_movements alter column recorded_at set default clock_timestamp();
create or replace function private.place_customer_order(p_service text,p_table_number text,p_customer_name text,p_items jsonb,p_expected_date date,p_expected_revision bigint,p_expected_discount_bps integer,p_method public.payment_method,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; payload jsonb; prior private.customer_order_requests; created jsonb; row public.orders; item_lines jsonb; recorded timestamptz;
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
    recorded:=clock_timestamp();
    insert into public.order_payments(order_id,method,amount,received_by,paid_at) values(row.id,p_method,row.total,actor,recorded);
    update public.orders set paid_at=recorded,paid_by=actor,payment_method=p_method,payment_methods=array[p_method] where id=row.id;
    select coalesce(jsonb_agg(jsonb_build_object('menu_item_id',i.menu_item_id,'item_name',i.item_name,'quantity',i.quantity,'unit_price',i.unit_price,'net_total',i.net_total)),'[]'::jsonb) into item_lines from public.order_items i where i.order_id=row.id and i.status<>'voided';
    insert into public.order_cash_movements(order_id,request_id,kind,method,amount,lines,received_by,recorded_at) values(row.id,p_request_id,'initial',p_method,row.total,item_lines,actor,recorded);
    insert into public.order_events(order_id,actor_id,event_type,payload) values(row.id,actor,'takeaway_paid',jsonb_build_object('method',p_method,'amount',row.total,'request_id',p_request_id));
  end if;
  insert into private.customer_order_requests values(p_request_id,actor,row.id,payload);
  return jsonb_build_object('order_id',row.id,'snapshot',private.order_snapshot(row.id));
end $$;

notify pgrst,'reload schema';
