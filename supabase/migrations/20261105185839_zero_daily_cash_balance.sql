-- A business day is a separate cash cycle. No opening balance crosses Bolivia midnight.
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(20261030,15);
alter table public.cash_shifts add column is_day_closed boolean not null default false,
 add constraint cash_day_closed_requires_close check(not is_day_closed or (status<>'open' and closed_at is not null));
drop index public.cash_shifts_one_live_idx;
create unique index cash_shifts_one_live_idx on public.cash_shifts((true))
 where status='open' or (status='awaiting_receipt' and not is_day_closed);
-- Preserve all financial snapshots; archive only the lifecycle of previous closed days.
update public.cash_shifts set is_day_closed=true where status<>'open'
 and (opened_at at time zone 'America/La_Paz')::date<(clock_timestamp() at time zone 'America/La_Paz')::date;

create or replace function private.open_cashbox_shift(p_request_id uuid,p_cash numeric,p_previous_shift uuid default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare day date:=(clock_timestamp() at time zone 'America/La_Paz')::date;plan jsonb;actor uuid; s public.cash_shifts;fresh public.cash_shifts;fingerprint text:=md5(jsonb_build_array('open',p_cash,p_previous_shift,p_note)::text);cached jsonb;note text:=btrim(coalesce(p_note,''));
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 perform pg_advisory_xact_lock(20261030,15);actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if p_request_id is null or p_cash is null or p_cash<0 or p_cash>9999999999.99 or p_cash<>round(p_cash,2) or length(note)>500 then raise exception using errcode='22023',message='Revisa el efectivo y la observación'; end if;
 cached:=private.cash_request_result(p_request_id,fingerprint);if cached is not null then return cached; end if;
 plan:=private.cash_schedule(clock_timestamp());
 day:=(plan->>'date')::date;
 if not (plan->>'in_hours')::boolean then raise exception using errcode='55000',message='Apertura disponible de 10:00 a 21:30, hora de Bolivia';end if;
 select * into s from public.cash_shifts where status='open' or (status='awaiting_receipt' and not is_day_closed) for update;
 if s.status='open' then raise exception using errcode='40001',message='Ya hay un turno abierto. Actualiza la caja'; end if;
 if exists(select 1 from public.cash_shifts where is_day_closed and (opened_at at time zone 'America/La_Paz')::date=day) then raise exception using errcode='55000',message='El día ya está cerrado. La siguiente jornada comienza con saldo cero';end if;
 if s.status='awaiting_receipt' and (s.opened_at at time zone 'America/La_Paz')::date<day then
  update public.cash_shifts set is_day_closed=true where id=s.id;
  s:=null;
 end if;
 if s.status is distinct from 'awaiting_receipt' and p_cash<>0 then raise exception using errcode='22023',message='Cada día debe abrir con saldo inicial Bs 0. No recibas dinero del día anterior';end if;
 if s.status='awaiting_receipt' then
  if p_previous_shift is distinct from s.id then raise exception using errcode='40001',message='Cambió la entrega pendiente. Actualiza la caja'; end if;
  if (p_cash<>s.cash_left or actor=s.cashier_id) and length(note)<3 then raise exception using errcode='22023',message='Registra una observación por la diferencia o por recibir tu propia entrega'; end if;
  update public.cash_shifts set status='received',received_at=clock_timestamp(),received_by=actor,received_cash=p_cash,receipt_difference=p_cash-s.cash_left,receipt_note=note where id=s.id;
  insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(s.id,actor,'received',jsonb_build_object('cash',p_cash,'difference',p_cash-s.cash_left,'note',note));
 elsif p_previous_shift is not null and not exists(select 1 from public.cash_shifts where id=p_previous_shift and is_day_closed and (opened_at at time zone 'America/La_Paz')::date<day) then raise exception using errcode='40001',message='Ya no existe esa entrega pendiente'; end if;
 insert into public.cash_shifts(cashier_id,opening_cash,opening_note,previous_shift_id,shift_slot,scheduled_start_at,scheduled_end_at) values(actor,p_cash,note,case when s.status='awaiting_receipt' then s.id else null end,plan->>'slot',(plan->>'starts_at')::timestamptz,(plan->>'ends_at')::timestamptz) returning * into fresh;
 update private.cashbox_configuration set enabled=true where singleton;
 insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(fresh.id,actor,'opened',jsonb_build_object('cash',p_cash,'previous_shift',fresh.previous_shift_id));
 insert into private.cashbox_requests values(p_request_id,actor,fingerprint,fresh.id);
 return private.cash_shift_value(fresh.id);
end $$;

create or replace function private.close_cashbox_shift(p_request_id uuid,p_shift_id uuid,p_digest text,p_counted numeric,p_withdrawal numeric default 0,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare final_day boolean;actor uuid;s public.cash_shifts;receipts jsonb;cash numeric;qr numeric;other numeric;fingerprint text:=md5(jsonb_build_array('close',p_shift_id,p_digest,p_counted,p_withdrawal,p_note)::text);cached jsonb;note text:=btrim(coalesce(p_note,''));
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 perform pg_advisory_xact_lock(20261030,15);actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if p_request_id is null or p_shift_id is null or p_digest is null or p_counted is null or p_counted<0 or p_counted>9999999999.99 or p_counted<>round(p_counted,2)
 or p_withdrawal is null or p_withdrawal<0 or p_withdrawal>p_counted or p_withdrawal<>round(p_withdrawal,2) or length(note)>500 then raise exception using errcode='22023',message='Revisa el conteo, el retiro y la observación'; end if;
 cached:=private.cash_request_result(p_request_id,fingerprint);if cached is not null then return cached; end if;
 select * into s from public.cash_shifts where id=p_shift_id and status='open' for update;
 if not found then raise exception using errcode='40001',message='Este turno ya cambió o fue cerrado. Actualiza la caja'; end if;
 if actor<>s.cashier_id and (select private.current_app_role())<>'admin' then raise exception using errcode='42501',message='Solo el responsable del turno o Administración puede cerrarlo'; end if;
 receipts:=private.cash_receipts(s.id);
 if md5(receipts::text)<>p_digest then raise exception using errcode='40001',message='Hubo nuevos cobros o cambios. Actualiza y revisa el efectivo antes de cerrar'; end if;
 select coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='cash'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='qr'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method' not in('cash','qr')),0) into cash,qr,other from jsonb_array_elements(receipts) v;
 if (p_counted<>s.opening_cash+cash or p_withdrawal>0 or actor<>s.cashier_id) and length(note)<3 then raise exception using errcode='22023',message='Explica la diferencia, el retiro o el cierre por otro responsable'; end if;
 final_day:=coalesce(s.shift_slot,private.cash_schedule(s.opened_at)->>'slot')='afternoon' or (s.opened_at at time zone 'America/La_Paz')::date<(clock_timestamp() at time zone 'America/La_Paz')::date;
 update public.cash_shifts set is_day_closed=final_day,status='awaiting_receipt',closed_at=clock_timestamp(),closed_by=actor,cash_net=cash,qr_net=qr,other_net=other,receipt_count=jsonb_array_length(receipts),
 counted_cash=p_counted,withdrawal=p_withdrawal,cash_left=p_counted-p_withdrawal,difference=p_counted-opening_cash-cash,close_note=note,closing_snapshot=receipts where id=s.id;
 insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(s.id,actor,'closed',jsonb_build_object('counted',p_counted,'withdrawal',p_withdrawal,'left',p_counted-p_withdrawal,'difference',p_counted-s.opening_cash-cash,'note',note,'day_closed',final_day));
 insert into private.cashbox_requests values(p_request_id,actor,fingerprint,s.id);
 return private.cash_shift_value(s.id);
end $$;
create or replace function private.cashbox_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare at_time timestamptz:=clock_timestamp();actor uuid; s public.cash_shifts; receipts jsonb;cash numeric;qr numeric;other numeric;
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 select * into s from public.cash_shifts where status='open' or(status='awaiting_receipt' and not is_day_closed and (opened_at at time zone 'America/La_Paz')::date=(at_time at time zone 'America/La_Paz')::date);
 receipts:=case when s.status='open' then private.cash_receipts(s.id) else coalesce(s.closing_snapshot,'[]'::jsonb) end;
 select coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='cash'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='qr'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method' not in('cash','qr')),0) into cash,qr,other from jsonb_array_elements(receipts) v;
 return jsonb_build_object('version',1,'actor_id',actor,'server_time',at_time,'schedule',private.cash_schedule(at_time),'enabled',(select enabled from private.cashbox_configuration where singleton),
  'day_closed',exists(select 1 from public.cash_shifts where is_day_closed and (opened_at at time zone 'America/La_Paz')::date=(at_time at time zone 'America/La_Paz')::date),
  'shift',private.cash_shift_value(s.id),'receipts',receipts,'digest',md5(receipts::text),
  'summary',jsonb_build_object('cash',cash,'qr',qr,'other',other,'receipts',jsonb_array_length(receipts),'expected_cash',coalesce(s.opening_cash,0)+cash));
end $$;
notify pgrst,'reload schema';
