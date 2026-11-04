-- Read-only daily sales of the shared drawer. Opening/received cash is never revenue.
set local lock_timeout='5s';
set local statement_timeout='30s';
create function private.cashbox_daily_summary(p_date date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare day date:=coalesce(p_date,(current_timestamp at time zone 'America/La_Paz')::date);result jsonb;
begin
 perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
 if day<date '2000-01-01' or day>date '2099-12-31' then raise exception using errcode='22023',message='Fecha de caja inválida';end if;
 with bounds as(
  select day::timestamp at time zone 'America/La_Paz' as first_at,(day+1)::timestamp at time zone 'America/La_Paz' as last_at
 ), receipts as materialized (
  select coalesce(s.shift_slot,private.cash_schedule(s.opened_at)->>'slot') as slot,v
  from public.cash_shifts s cross join bounds b
  cross join lateral jsonb_array_elements(case when s.status='open' then private.cash_receipts(s.id) else s.closing_snapshot end) v
  where s.opened_at<b.last_at and (s.closed_at is null or s.closed_at>=b.first_at)
   and (v->>'recorded_at')::timestamptz>=b.first_at and (v->>'recorded_at')::timestamptz<b.last_at
 ), totals as (
  select slot,coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='cash'),0) as cash,
   coalesce(sum((v->>'amount')::numeric) filter(where v->>'method'='qr'),0) as qr,
   coalesce(sum((v->>'amount')::numeric) filter(where v->>'method' not in('cash','qr')),0) as other,count(*) as receipts
  from receipts group by slot
 ), rows as (
  select slots.slot,slots.label,slots.position,coalesce(t.cash,0) as cash,coalesce(t.qr,0) as qr,coalesce(t.other,0) as other,coalesce(t.receipts,0) as receipts
  from (values('morning','Mañana',1),('afternoon','Tarde',2)) slots(slot,label,position) left join totals t using(slot)
 ) select jsonb_build_object('date',day,'today',(current_timestamp at time zone 'America/La_Paz')::date,
  'summary',jsonb_build_object('cash',sum(cash),'qr',sum(qr),'other',sum(other),'total',sum(cash+qr+other),'receipts',sum(receipts)),
  'shifts',jsonb_agg(jsonb_build_object('slot',slot,'label',label,'cash',cash,'qr',qr,'other',other,'total',cash+qr+other,'receipts',receipts) order by position)) into result from rows;
 return result;
end $$;
revoke all on function private.cashbox_daily_summary(date) from public,anon,authenticated,service_role;
grant execute on function private.cashbox_daily_summary(date) to authenticated;
create function public.get_cashbox_daily_summary(p_date date default null) returns jsonb
language sql stable security invoker set search_path='' as $$select private.cashbox_daily_summary($1)$$;
revoke all on function public.get_cashbox_daily_summary(date) from public,anon,service_role;
grant execute on function public.get_cashbox_daily_summary(date) to authenticated;
notify pgrst,'reload schema';
