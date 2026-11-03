-- Bolivia shifts. No automatic opening, closing, cash count or backdating.
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.cash_shifts add column shift_slot text check(shift_slot in('morning','afternoon')),
 add column scheduled_start_at timestamptz,add column scheduled_end_at timestamptz,
 add constraint cash_shift_schedule_valid check(
  (shift_slot is null and scheduled_start_at is null and scheduled_end_at is null) or
  (shift_slot is not null and scheduled_start_at is not null and scheduled_end_at is not null and scheduled_end_at>scheduled_start_at));

create function private.cash_schedule(p_at timestamptz) returns jsonb
language sql immutable security invoker set search_path='' as $$
 with local_time as(select p_at at time zone 'America/La_Paz' as t), bounds as(
  select t,case when t::time<time '14:00' then 'morning' else 'afternoon' end as slot,
   (t::date+case when t::time<time '14:00' then time '10:00' else time '14:00' end) at time zone 'America/La_Paz' as starts_at,
   (t::date+case when t::time<time '14:00' then time '14:00' else time '21:30' end) at time zone 'America/La_Paz' as ends_at from local_time
 ) select jsonb_build_object('slot',slot,'label',case slot when 'morning' then 'Mañana' else 'Tarde' end,'date',t::date,
  'starts_at',starts_at,'ends_at',ends_at,'in_hours',p_at>=starts_at and p_at<ends_at) from bounds;
$$;
revoke all on function private.cash_schedule(timestamptz) from public,anon,authenticated,service_role;

create function private.assert_current_cash_shift() returns uuid
language plpgsql security invoker set search_path='' as $$
declare s public.cash_shifts;plan jsonb;at_time timestamptz;
begin
 perform pg_advisory_xact_lock(20261030,15);
 at_time:=clock_timestamp();
 select * into s from public.cash_shifts where status='open';
 if not found then raise exception using errcode='55000',message='Abre o recibe la caja en Caja y turnos antes de registrar pedidos o cobros';end if;
 plan:=private.cash_schedule(s.opened_at);
 if at_time>=coalesce(s.scheduled_end_at,(plan->>'ends_at')::timestamptz) then raise exception using errcode='55000',message='Terminó el horario del turno. Cierra y entrega la caja antes de continuar';end if;
 if at_time<coalesce(s.scheduled_start_at,(plan->>'starts_at')::timestamptz) then raise exception using errcode='55000',message='El turno todavía no empezó. Revisa el horario en Caja y turnos';end if;
 return s.id;
end $$;
revoke all on function private.assert_current_cash_shift() from public,anon,authenticated,service_role;

create function private.guard_customer_order_shift() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.purchase_type='customer' then
  perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
  perform private.assert_current_cash_shift();
 end if;
 return new;
end $$;
revoke all on function private.guard_customer_order_shift() from public,anon,authenticated,service_role;
create trigger require_shift_before_customer_order before insert on public.orders for each row execute function private.guard_customer_order_shift();

create or replace function private.capture_shift_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
declare current_shift uuid;
begin
 perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if new.received_by is distinct from auth.uid() then raise exception using errcode='42501',message='Cobrador inválido';end if;
 current_shift:=private.assert_current_cash_shift();
 if tg_table_name='order_payments' then
  insert into private.cash_shift_receipts(shift_id,payment_id) values(current_shift,new.id);
 else
  insert into private.cash_shift_receipts(shift_id,movement_id) values(current_shift,new.id);
 end if;
 return new;
end $$;

-- Mandatory from this release, including after an authorized test reset.
update private.cashbox_configuration set enabled=true where singleton;

create or replace function private.open_cashbox_shift(p_request_id uuid,p_cash numeric,p_previous_shift uuid default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare plan jsonb;actor uuid; s public.cash_shifts;fresh public.cash_shifts;fingerprint text:=md5(jsonb_build_array('open',p_cash,p_previous_shift,p_note)::text);cached jsonb;note text:=btrim(coalesce(p_note,''));
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 perform pg_advisory_xact_lock(20261030,15);actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if p_request_id is null or p_cash is null or p_cash<0 or p_cash>9999999999.99 or p_cash<>round(p_cash,2) or length(note)>500 then raise exception using errcode='22023',message='Revisa el efectivo y la observación'; end if;
 cached:=private.cash_request_result(p_request_id,fingerprint);if cached is not null then return cached; end if;
 plan:=private.cash_schedule(clock_timestamp());
 if not (plan->>'in_hours')::boolean then raise exception using errcode='55000',message='Apertura disponible de 10:00 a 21:30, hora de Bolivia';end if;
 select * into s from public.cash_shifts where status in('open','awaiting_receipt') for update;
 if s.status='open' then raise exception using errcode='40001',message='Ya hay un turno abierto. Actualiza la caja'; end if;
 if s.status='awaiting_receipt' then
  if p_previous_shift is distinct from s.id then raise exception using errcode='40001',message='Cambió la entrega pendiente. Actualiza la caja'; end if;
  if (p_cash<>s.cash_left or actor=s.cashier_id) and length(note)<3 then raise exception using errcode='22023',message='Registra una observación por la diferencia o por recibir tu propia entrega'; end if;
  update public.cash_shifts set status='received',received_at=clock_timestamp(),received_by=actor,received_cash=p_cash,receipt_difference=p_cash-s.cash_left,receipt_note=note where id=s.id;
  insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(s.id,actor,'received',jsonb_build_object('cash',p_cash,'difference',p_cash-s.cash_left,'note',note));
 elsif p_previous_shift is not null then raise exception using errcode='40001',message='Ya no existe esa entrega pendiente'; end if;
 insert into public.cash_shifts(cashier_id,opening_cash,opening_note,previous_shift_id,shift_slot,scheduled_start_at,scheduled_end_at) values(actor,p_cash,note,case when s.status='awaiting_receipt' then s.id else null end,plan->>'slot',(plan->>'starts_at')::timestamptz,(plan->>'ends_at')::timestamptz) returning * into fresh;
 update private.cashbox_configuration set enabled=true where singleton;
 insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(fresh.id,actor,'opened',jsonb_build_object('cash',p_cash,'previous_shift',fresh.previous_shift_id));
 insert into private.cashbox_requests values(p_request_id,actor,fingerprint,fresh.id);
 return private.cash_shift_value(fresh.id);
end $$;

create or replace function private.cashbox_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare at_time timestamptz:=clock_timestamp();actor uuid; s public.cash_shifts; receipts jsonb;cash numeric;qr numeric;other numeric;
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 select * into s from public.cash_shifts where status in('open','awaiting_receipt');
 receipts:=case when s.status='open' then private.cash_receipts(s.id) else coalesce(s.closing_snapshot,'[]'::jsonb) end;
 select coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='cash'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='qr'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method' not in('cash','qr')),0) into cash,qr,other from jsonb_array_elements(receipts) v;
 return jsonb_build_object('version',1,'actor_id',actor,'server_time',at_time,'schedule',private.cash_schedule(at_time),'enabled',(select enabled from private.cashbox_configuration where singleton),
  'shift',private.cash_shift_value(s.id),'receipts',receipts,'digest',md5(receipts::text),
  'summary',jsonb_build_object('cash',cash,'qr',qr,'other',other,'receipts',jsonb_array_length(receipts),'expected_cash',coalesce(s.opening_cash,0)+cash));
end $$;
notify pgrst,'reload schema';
