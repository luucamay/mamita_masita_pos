-- Shared physical drawer. Dormant until the first explicit opening; no backfill.
create table public.cash_shifts (
 id uuid primary key default gen_random_uuid(),
 cashier_id uuid not null references public.profiles(id),
 opened_at timestamptz not null default clock_timestamp(),
 opening_cash numeric(12,2) not null check(opening_cash>=0),
 opening_note text not null default '' check(length(opening_note)<=500),
 previous_shift_id uuid unique references public.cash_shifts(id),
 status text not null default 'open' check(status in('open','awaiting_receipt','received')),
 closed_at timestamptz, closed_by uuid references public.profiles(id),
 cash_net numeric(12,2) not null default 0,qr_net numeric(12,2) not null default 0,other_net numeric(12,2) not null default 0,
 receipt_count integer not null default 0 check(receipt_count>=0),
 counted_cash numeric(12,2) check(counted_cash>=0),withdrawal numeric(12,2) not null default 0 check(withdrawal>=0),
 cash_left numeric(12,2),difference numeric(12,2),close_note text not null default '' check(length(close_note)<=500),
 closing_snapshot jsonb not null default '[]'::jsonb check(jsonb_typeof(closing_snapshot)='array'),
 received_at timestamptz,received_by uuid references public.profiles(id),
 received_cash numeric(12,2) check(received_cash>=0),receipt_difference numeric(12,2),receipt_note text not null default '' check(length(receipt_note)<=500),
 check((status='open' and closed_at is null and closed_by is null and counted_cash is null and cash_left is null and difference is null)
  or (status<>'open' and closed_at is not null and closed_by is not null and counted_cash is not null and cash_left is not null and difference is not null and cash_left=counted_cash-withdrawal and cash_left>=0 and difference=counted_cash-opening_cash-cash_net)),
 check((status='received' and received_at is not null and received_by is not null and received_cash is not null and receipt_difference is not null and receipt_difference=received_cash-cash_left)
  or(status<>'received' and received_at is null and received_by is null and received_cash is null))
);
create unique index cash_shifts_one_live_idx on public.cash_shifts((true)) where status in('open','awaiting_receipt');
create index cash_shifts_history_idx on public.cash_shifts(closed_at desc,id desc) where closed_at is not null;
create index cash_shifts_cashier_history_idx on public.cash_shifts(cashier_id,closed_at desc,id desc) where closed_at is not null;
alter table public.cash_shifts enable row level security;
revoke all on public.cash_shifts from public,anon,authenticated;
grant select on public.cash_shifts to authenticated;
create policy cash_shifts_read on public.cash_shifts for select to authenticated using (
 (select private.current_app_role())='admin' or
 (select private.current_app_role()) is not null and (cashier_id=(select auth.uid()) or received_by=(select auth.uid())) or
 (select private.current_app_role())='staff' and status in('open','awaiting_receipt')
);
create table private.cashbox_configuration(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into private.cashbox_configuration(singleton,enabled) values(true,false);
create table private.cash_shift_receipts(
 id bigint generated always as identity primary key,shift_id uuid not null references public.cash_shifts(id),
 payment_id uuid unique references public.order_payments(id),movement_id uuid unique references public.order_cash_movements(id),
 check(num_nonnulls(payment_id,movement_id)=1)
);
create index cash_shift_receipts_shift_idx on private.cash_shift_receipts(shift_id);
create table private.cashbox_requests(request_id uuid primary key,actor_id uuid not null references public.profiles(id),fingerprint text not null,shift_id uuid not null references public.cash_shifts(id));
create table private.cashbox_events(id bigint generated always as identity primary key,shift_id uuid not null references public.cash_shifts(id),actor_id uuid not null references public.profiles(id),event_type text not null,payload jsonb not null,created_at timestamptz not null default clock_timestamp());
alter table private.cashbox_configuration enable row level security;
alter table private.cash_shift_receipts enable row level security;
alter table private.cashbox_requests enable row level security;
alter table private.cashbox_events enable row level security;
revoke all on private.cashbox_configuration,private.cash_shift_receipts,private.cashbox_requests,private.cashbox_events from public,anon,authenticated,service_role;

-- Financial inserts and drawer transitions share one transaction lock. Association
-- uses committed receipt IDs, not client clocks, so concurrent payments cannot fall
-- between shifts. Original payment+initial movement are associated, then deduplicated.
create function private.capture_shift_receipt() returns trigger language plpgsql security definer set search_path='' as $$
declare current_shift uuid;
begin
 perform pg_advisory_xact_lock(20261030,15);
 if not (select enabled from private.cashbox_configuration where singleton) then return new; end if;
 perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if new.received_by is distinct from auth.uid() then raise exception using errcode='42501',message='Cobrador inválido'; end if;
 select id into current_shift from public.cash_shifts where status='open';
 if current_shift is null then raise exception using errcode='55000',message='Abre o recibe la caja antes de registrar un cobro o devolución'; end if;
 if tg_table_name='order_payments' then
  insert into private.cash_shift_receipts(shift_id,payment_id) values(current_shift,new.id);
 else
  insert into private.cash_shift_receipts(shift_id,movement_id) values(current_shift,new.id);
 end if;
 return new;
end $$;
revoke all on function private.capture_shift_receipt() from public,anon,authenticated,service_role;
create trigger capture_payment_shift after insert on public.order_payments for each row execute function private.capture_shift_receipt();
create trigger capture_movement_shift after insert on public.order_cash_movements for each row execute function private.capture_shift_receipt();

create function private.cash_shift_value(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('cashier_name',coalesce(p.full_name,'Sin nombre'),'closed_by_name',c.full_name,'received_by_name',r.full_name)
 from public.cash_shifts s left join public.profiles p on p.id=s.cashier_id left join public.profiles c on c.id=s.closed_by left join public.profiles r on r.id=s.received_by where s.id=p_id;
$$;
create function private.cash_receipts(p_shift uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with receipts as (
  select 'payment' as source_kind,p.id,p.order_id,p.method,p.amount,p.received_by,p.paid_at as recorded_at,'initial' as kind
  from private.cash_shift_receipts r join public.order_payments p on p.id=r.payment_id where r.shift_id=p_shift
  and not exists(select 1 from public.order_cash_movements m where m.order_id=p.order_id and m.kind='initial')
  union all
  select 'movement',m.id,m.order_id,m.method,m.amount,m.received_by,m.recorded_at,m.kind
  from private.cash_shift_receipts r join public.order_cash_movements m on m.id=r.movement_id where r.shift_id=p_shift
 ) select coalesce(jsonb_agg(jsonb_build_object('source_kind',r.source_kind,'source_id',r.id,'order_id',r.order_id,'order_number',o.order_number,
  'recorded_at',r.recorded_at,'method',r.method,'amount',r.amount,'kind',r.kind,'received_by',r.received_by,'receiver_name',coalesce(p.full_name,'Sin nombre'),'purchase_type',o.purchase_type)
  order by r.recorded_at,r.id,r.source_kind),'[]'::jsonb)
 from receipts r join public.orders o on o.id=r.order_id left join public.profiles p on p.id=r.received_by;
$$;
create function private.cash_request_result(p_request uuid,p_fingerprint text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.cashbox_requests;
begin
 select * into r from private.cashbox_requests where request_id=p_request;
 if not found then return null; end if;
 if r.actor_id is distinct from auth.uid() then raise exception using errcode='42501',message='Operación de otra cuenta'; end if;
 if r.fingerprint<>p_fingerprint then raise exception using errcode='22023',message='La operación ya corresponde a otros datos'; end if;
 return private.cash_shift_value(r.shift_id);
end $$;
revoke all on function private.cash_shift_value(uuid),private.cash_receipts(uuid),private.cash_request_result(uuid,text) from public,anon,authenticated,service_role;

create function private.cashbox_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid; s public.cash_shifts; receipts jsonb;cash numeric;qr numeric;other numeric;
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 select * into s from public.cash_shifts where status in('open','awaiting_receipt');
 receipts:=case when s.status='open' then private.cash_receipts(s.id) else coalesce(s.closing_snapshot,'[]'::jsonb) end;
 select coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='cash'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='qr'),0),coalesce(sum((v->>'amount')::numeric) filter(where v->>'method' not in('cash','qr')),0) into cash,qr,other from jsonb_array_elements(receipts) v;
 return jsonb_build_object('version',1,'actor_id',actor,'server_time',clock_timestamp(),'enabled',(select enabled from private.cashbox_configuration where singleton),
  'shift',private.cash_shift_value(s.id),'receipts',receipts,'digest',md5(receipts::text),
  'summary',jsonb_build_object('cash',cash,'qr',qr,'other',other,'receipts',jsonb_array_length(receipts),'expected_cash',coalesce(s.opening_cash,0)+cash));
end $$;
create function private.open_cashbox_shift(p_request_id uuid,p_cash numeric,p_previous_shift uuid default null,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; s public.cash_shifts;fresh public.cash_shifts;fingerprint text:=md5(jsonb_build_array('open',p_cash,p_previous_shift,p_note)::text);cached jsonb;note text:=btrim(coalesce(p_note,''));
begin
 actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 perform pg_advisory_xact_lock(20261030,15);actor:=private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if p_request_id is null or p_cash is null or p_cash<0 or p_cash>9999999999.99 or p_cash<>round(p_cash,2) or length(note)>500 then raise exception using errcode='22023',message='Revisa el efectivo y la observación'; end if;
 cached:=private.cash_request_result(p_request_id,fingerprint);if cached is not null then return cached; end if;
 select * into s from public.cash_shifts where status in('open','awaiting_receipt') for update;
 if s.status='open' then raise exception using errcode='40001',message='Ya hay un turno abierto. Actualiza la caja'; end if;
 if s.status='awaiting_receipt' then
  if p_previous_shift is distinct from s.id then raise exception using errcode='40001',message='Cambió la entrega pendiente. Actualiza la caja'; end if;
  if (p_cash<>s.cash_left or actor=s.cashier_id) and length(note)<3 then raise exception using errcode='22023',message='Registra una observación por la diferencia o por recibir tu propia entrega'; end if;
  update public.cash_shifts set status='received',received_at=clock_timestamp(),received_by=actor,received_cash=p_cash,receipt_difference=p_cash-s.cash_left,receipt_note=note where id=s.id;
  insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(s.id,actor,'received',jsonb_build_object('cash',p_cash,'difference',p_cash-s.cash_left,'note',note));
 elsif p_previous_shift is not null then raise exception using errcode='40001',message='Ya no existe esa entrega pendiente'; end if;
 insert into public.cash_shifts(cashier_id,opening_cash,opening_note,previous_shift_id) values(actor,p_cash,note,case when s.status='awaiting_receipt' then s.id else null end) returning * into fresh;
 update private.cashbox_configuration set enabled=true where singleton;
 insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(fresh.id,actor,'opened',jsonb_build_object('cash',p_cash,'previous_shift',fresh.previous_shift_id));
 insert into private.cashbox_requests values(p_request_id,actor,fingerprint,fresh.id);
 return private.cash_shift_value(fresh.id);
end $$;
create function private.close_cashbox_shift(p_request_id uuid,p_shift_id uuid,p_digest text,p_counted numeric,p_withdrawal numeric default 0,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;s public.cash_shifts;receipts jsonb;cash numeric;qr numeric;other numeric;fingerprint text:=md5(jsonb_build_array('close',p_shift_id,p_digest,p_counted,p_withdrawal,p_note)::text);cached jsonb;note text:=btrim(coalesce(p_note,''));
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
 update public.cash_shifts set status='awaiting_receipt',closed_at=clock_timestamp(),closed_by=actor,cash_net=cash,qr_net=qr,other_net=other,receipt_count=jsonb_array_length(receipts),
 counted_cash=p_counted,withdrawal=p_withdrawal,cash_left=p_counted-p_withdrawal,difference=p_counted-opening_cash-cash,close_note=note,closing_snapshot=receipts where id=s.id;
 insert into private.cashbox_events(shift_id,actor_id,event_type,payload) values(s.id,actor,'closed',jsonb_build_object('counted',p_counted,'withdrawal',p_withdrawal,'left',p_counted-p_withdrawal,'difference',p_counted-s.opening_cash-cash,'note',note));
 insert into private.cashbox_requests values(p_request_id,actor,fingerprint,s.id);
 return private.cash_shift_value(s.id);
end $$;
create function private.list_cashbox_shifts(p_employee uuid default null,p_start date default null,p_end date default null,p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid;app_role public.user_role;first_day date:=coalesce(p_start,(current_timestamp at time zone 'America/La_Paz')::date);last_day date:=coalesce(p_end,first_day);target uuid;result jsonb;
begin
 app_role:=private.current_app_role();actor:=auth.uid();
 if actor is null or app_role is null then raise exception using errcode='42501',message='Acceso inactivo';end if;
 target:=case when app_role='admin' then p_employee else actor end;
 if app_role<>'admin' and p_employee is not null and p_employee<>actor then raise exception using errcode='42501',message='Solo puedes consultar tus cierres';end if;
 if first_day<date '2000-01-01' or last_day>date '2099-12-31' or last_day<first_day or last_day-first_day>365 or p_page is null or p_page<0 or p_page>100000 then raise exception using errcode='22023',message='Rango de cierres inválido';end if;
 with selected as materialized(select id,closed_at from public.cash_shifts where closed_at>=(first_day::timestamp at time zone 'America/La_Paz') and closed_at<((last_day+1)::timestamp at time zone 'America/La_Paz') and (target is null or cashier_id=target)),
 page_rows as(select * from selected order by closed_at desc,id desc limit 25 offset(p_page*25))
 select jsonb_build_object('range',jsonb_build_object('start',first_day,'end',last_day,'today',(current_timestamp at time zone 'America/La_Paz')::date),'page',p_page,'page_size',25,'total_count',(select count(*) from selected),
 'shifts',coalesce((select jsonb_agg(private.cash_shift_value(id) order by closed_at desc,id desc) from page_rows),'[]'::jsonb)) into result;
 return result;
end $$;

create table private.employee_password_requests(
 request_id uuid primary key,employee_id uuid not null references public.profiles(id),actor_id uuid not null references public.profiles(id),
 fingerprint text not null check(length(fingerprint)=64),status text not null default 'pending' check(status in('pending','completed','expired')),
 created_at timestamptz not null default clock_timestamp(),completed_at timestamptz
);
create unique index employee_password_one_pending_idx on private.employee_password_requests(employee_id) where status='pending';
alter table private.employee_password_requests enable row level security;
revoke all on private.employee_password_requests from public,anon,authenticated,service_role;
create function private.admin_prepare_password_reset(p_request uuid,p_employee uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;r private.employee_password_requests;
begin
 perform private.admin_employee_context();actor:=auth.uid();
 perform pg_advisory_xact_lock(20261030,16);perform private.admin_employee_context();
 if p_request is null or p_employee is null or p_employee=actor or p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{64}$' or not exists(select 1 from public.profiles where id=p_employee) then raise exception using errcode='22023',message='Cambio de contraseña inválido';end if;
 select * into r from private.employee_password_requests where request_id=p_request;
 if found then
  if r.actor_id<>actor or r.employee_id<>p_employee or r.fingerprint<>p_fingerprint or r.status='expired' then raise exception using errcode='40001',message='Esta operación ya no corresponde. Actualiza las credenciales';end if;
  return to_jsonb(r);
 end if;
 update private.employee_password_requests set status='expired' where employee_id=p_employee and status='pending' and created_at<clock_timestamp()-interval '10 minutes';
 if exists(select 1 from private.employee_password_requests where employee_id=p_employee and status='pending') then raise exception using errcode='40001',message='Hay otro cambio de contraseña en curso. Reintenta la misma operación';end if;
 insert into private.employee_password_requests(request_id,employee_id,actor_id,fingerprint) values(p_request,p_employee,actor,p_fingerprint) returning * into r;
 return to_jsonb(r);
end $$;
create function private.admin_complete_password_reset(p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;r private.employee_password_requests;
begin
 perform private.admin_employee_context();actor:=auth.uid();
 perform pg_advisory_xact_lock(20261030,16);perform private.admin_employee_context();
 select * into r from private.employee_password_requests where request_id=p_request for update;
 if not found or r.actor_id<>actor or r.status='expired' then raise exception using errcode='42501',message='Cambio de contraseña no autorizado';end if;
 if not exists(select 1 from auth.users u where u.id=r.employee_id and u.raw_app_meta_data->>'mamita_password_reset_request'=r.request_id::text) then raise exception using errcode='42501',message='No se pudo verificar el cambio en Auth';end if;
 if r.status<>'completed' then
  update private.employee_password_requests set status='completed',completed_at=clock_timestamp() where request_id=p_request returning * into r;
  insert into private.employee_events(actor_id,employee_id,action) values(actor,r.employee_id,'password_reset');
 end if;
 return to_jsonb(r);
end $$;

-- Only guarded private entry points are callable by authenticated users.
revoke all on function private.cashbox_context(),private.open_cashbox_shift(uuid,numeric,uuid,text),private.close_cashbox_shift(uuid,uuid,text,numeric,numeric,text),private.list_cashbox_shifts(uuid,date,date,integer),private.admin_prepare_password_reset(uuid,uuid,text),private.admin_complete_password_reset(uuid) from public,anon,authenticated,service_role;
grant execute on function private.cashbox_context(),private.open_cashbox_shift(uuid,numeric,uuid,text),private.close_cashbox_shift(uuid,uuid,text,numeric,numeric,text),private.list_cashbox_shifts(uuid,date,date,integer),private.admin_prepare_password_reset(uuid,uuid,text),private.admin_complete_password_reset(uuid) to authenticated;
create function public.get_cashbox_context() returns jsonb language sql stable security invoker set search_path='' as $$select private.cashbox_context()$$;
create function public.open_cashbox_shift(p_request_id uuid,p_cash numeric,p_previous_shift uuid default null,p_note text default '') returns jsonb language sql security invoker set search_path='' as $$select private.open_cashbox_shift(p_request_id,p_cash,p_previous_shift,p_note)$$;
create function public.close_cashbox_shift(p_request_id uuid,p_shift_id uuid,p_digest text,p_counted numeric,p_withdrawal numeric default 0,p_note text default '') returns jsonb language sql security invoker set search_path='' as $$select private.close_cashbox_shift(p_request_id,p_shift_id,p_digest,p_counted,p_withdrawal,p_note)$$;
create function public.list_cashbox_shifts(p_employee uuid default null,p_start date default null,p_end date default null,p_page integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$select private.list_cashbox_shifts(p_employee,p_start,p_end,p_page)$$;
create function public.admin_prepare_password_reset(p_request uuid,p_employee uuid,p_fingerprint text) returns jsonb language sql security invoker set search_path='' as $$select private.admin_prepare_password_reset(p_request,p_employee,p_fingerprint)$$;
create function public.admin_complete_password_reset(p_request uuid) returns jsonb language sql security invoker set search_path='' as $$select private.admin_complete_password_reset(p_request)$$;
revoke all on function public.get_cashbox_context(),public.open_cashbox_shift(uuid,numeric,uuid,text),public.close_cashbox_shift(uuid,uuid,text,numeric,numeric,text),public.list_cashbox_shifts(uuid,date,date,integer),public.admin_prepare_password_reset(uuid,uuid,text),public.admin_complete_password_reset(uuid) from public,anon;
grant execute on function public.get_cashbox_context(),public.open_cashbox_shift(uuid,numeric,uuid,text),public.close_cashbox_shift(uuid,uuid,text,numeric,numeric,text),public.list_cashbox_shifts(uuid,date,date,integer),public.admin_prepare_password_reset(uuid,uuid,text),public.admin_complete_password_reset(uuid) to authenticated;
alter publication supabase_realtime add table public.cash_shifts;
notify pgrst,'reload schema';
