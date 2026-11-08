-- Keep the scheduled end distinct from the operational cutoff.
create function private.cash_shift_operational_end(p_shift public.cash_shifts)
returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select coalesce(p_shift.scheduled_end_at, (plan->>'ends_at')::timestamptz)
    + case coalesce(p_shift.shift_slot, plan->>'slot')
        when 'morning' then interval '1 hour'
        else interval '0'
      end
  from (select private.cash_schedule(p_shift.opened_at) as plan) as schedule;
$$;

revoke all on function private.cash_shift_operational_end(public.cash_shifts)
  from public, anon, authenticated, service_role;

create or replace function private.cash_shift_value(p_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select to_jsonb(s) || jsonb_build_object(
    'cashier_name', coalesce(p.full_name, 'Sin nombre'),
    'closed_by_name', c.full_name,
    'received_by_name', r.full_name,
    'operational_end_at', private.cash_shift_operational_end(s)
  )
  from public.cash_shifts s
  left join public.profiles p on p.id = s.cashier_id
  left join public.profiles c on c.id = s.closed_by
  left join public.profiles r on r.id = s.received_by
  where s.id = p_id;
$$;

create or replace function private.assert_current_cash_shift()
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  active_shift public.cash_shifts;
  checked_at timestamptz;
begin
  perform pg_advisory_xact_lock(20261030, 15);
  checked_at := clock_timestamp();
  select * into active_shift from public.cash_shifts where status = 'open';
  if not found then
    raise exception using errcode = '55000',
      message = 'Abre o recibe la caja en Caja y turnos antes de registrar pedidos o cobros';
  end if;
  if checked_at >= private.cash_shift_operational_end(active_shift) then
    raise exception using errcode = '55000',
      message = 'Terminó el horario del turno. Cierra y entrega la caja antes de continuar';
  end if;
  if checked_at < coalesce(active_shift.scheduled_start_at,
      (private.cash_schedule(active_shift.opened_at)->>'starts_at')::timestamptz) then
    raise exception using errcode = '55000',
      message = 'El turno todavía no empezó. Revisa el horario en Caja y turnos';
  end if;
  return active_shift.id;
end;
$$;
