-- P06: one general promotion per Bolivia date; orders retain their original rate.
create table public.daily_promotions (
  promotion_date date primary key,
  discount_bps integer not null check(discount_bps between 1 and 10000),
  active boolean not null default true,
  revision bigint not null default 1,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.daily_promotions enable row level security;
revoke all on public.daily_promotions from public,anon,authenticated;
grant select on public.daily_promotions to authenticated;
grant all on public.daily_promotions to service_role;
create policy promotions_admin_read on public.daily_promotions for select to authenticated
  using((select private.current_app_role())='admin');
create table private.promotion_events (
  id uuid primary key default gen_random_uuid(),
  promotion_date date not null references public.daily_promotions(promotion_date),
  actor_id uuid not null references public.profiles(id),
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.promotion_events enable row level security;
revoke all on private.promotion_events from public,anon,authenticated;
alter table public.orders add column promotion_date date,add column promotion_revision bigint;

create or replace function private.promotion_for_instant(p_instant timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('date',d.sale_day,'discount_bps',case when p.active then p.discount_bps else 0 end,
    'revision',coalesce(p.revision,0),'checked_at',p_instant,
    'expires_at',(d.sale_day+1)::timestamp at time zone 'America/La_Paz')
  from (select (p_instant at time zone 'America/La_Paz')::date sale_day) d
  left join public.daily_promotions p on p.promotion_date=d.sale_day
$$;
create or replace function private.lock_current_promotion()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sale_day date; instant timestamptz;
begin
  sale_day:=(clock_timestamp() at time zone 'America/La_Paz')::date;
  perform pg_advisory_xact_lock(20261030,sale_day-date '2000-01-01');
  instant:=clock_timestamp();
  if (instant at time zone 'America/La_Paz')::date<>sale_day then
    sale_day:=(instant at time zone 'America/La_Paz')::date;
    perform pg_advisory_xact_lock(20261030,sale_day-date '2000-01-01');
  end if;
  return private.promotion_for_instant(instant);
end $$;

create or replace function private.get_order_pricing_context()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
  return private.promotion_for_instant(clock_timestamp());
end $$;
create or replace function public.get_order_pricing_context()
returns jsonb language sql security invoker set search_path='' as $$ select private.get_order_pricing_context() $$;

create or replace function private.admin_save_daily_promotion(p_date date,p_discount_bps integer,p_active boolean,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; prior public.daily_promotions; saved public.daily_promotions;
begin
  perform private.assert_actor(array['admin']::public.user_role[],auth.uid());
  if p_date is null or not isfinite(p_date) or p_discount_bps is null or p_discount_bps not between 1 and 10000 or p_active is null then
    raise exception using errcode='22023',message='Revisa la fecha y el porcentaje (0,01 a 100 %)';
  end if;
  perform pg_advisory_xact_lock(20261030,p_date-date '2000-01-01');
  actor:=private.assert_actor(array['admin']::public.user_role[],auth.uid());
  if p_date<(clock_timestamp() at time zone 'America/La_Paz')::date then raise exception using errcode='22023',message='No se modifican promociones de días pasados'; end if;
  select * into prior from public.daily_promotions p where p.promotion_date=p_date for update;
  if found then
    if prior.discount_bps=p_discount_bps and prior.active=p_active then return to_jsonb(prior); end if;
    if prior.revision is distinct from p_expected_revision then raise exception using errcode='40001',message='La promoción cambió. Actualiza antes de guardar'; end if;
    update public.daily_promotions set discount_bps=p_discount_bps,active=p_active,revision=revision+1,updated_by=actor,updated_at=now()
      where promotion_date=p_date returning * into saved;
  else
    if p_expected_revision is not null then raise exception using errcode='40001',message='La promoción cambió. Actualiza antes de guardar'; end if;
    insert into public.daily_promotions(promotion_date,discount_bps,active,created_by,updated_by)
      values(p_date,p_discount_bps,p_active,actor,actor) returning * into saved;
  end if;
  insert into private.promotion_events(promotion_date,actor_id,before_value,after_value) values(p_date,actor,to_jsonb(prior),to_jsonb(saved));
  return to_jsonb(saved);
end $$;
create or replace function public.admin_save_daily_promotion(p_date date,p_discount_bps integer,p_active boolean,p_expected_revision bigint default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.admin_save_daily_promotion(p_date,p_discount_bps,p_active,p_expected_revision) $$;

create or replace function private.create_customer_order(p_table_number text,p_customer_name text,p_created_by uuid,p_quote jsonb)
returns table(order_id uuid,order_number text) language plpgsql security invoker set search_path='' as $$
declare uid uuid; id uuid; number text; seq integer; sale_day date:=(p_quote->>'date')::date;
begin
  uid:=private.assert_actor(array['admin','staff']::public.user_role[],p_created_by);
  if nullif(btrim(p_table_number),'') is null then raise exception 'La mesa es obligatoria'; end if;
  insert into public.order_daily_counters(counter_date,next_sequence) values(sale_day,2)
    on conflict(counter_date) do update set next_sequence=public.order_daily_counters.next_sequence+1 returning next_sequence-1 into seq;
  number:=to_char(sale_day,'YYYYMMDD')||'-'||lpad(seq::text,greatest(3,length(seq::text)),'0');
  insert into public.orders(order_number,table_number,customer_name,created_by,discount_bps,promotion_date,promotion_revision,created_at)
    values(number,btrim(p_table_number),nullif(btrim(p_customer_name),''),uid,(p_quote->>'discount_bps')::integer,sale_day,(p_quote->>'revision')::bigint,(p_quote->>'checked_at')::timestamptz)
    returning public.orders.id into id;
  if (p_quote->>'discount_bps')::integer>0 then
    insert into public.order_events(order_id,actor_id,event_type,payload) values(id,uid,'promotion_applied',p_quote);
  end if;
  return query select id,number;
end $$;
create or replace function private.create_order(p_table_number text,p_customer_name text default null,p_created_by uuid default auth.uid())
returns table(order_id uuid,order_number text) language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],p_created_by);
  return query select * from private.create_customer_order(p_table_number,p_customer_name,p_created_by,private.lock_current_promotion());
end $$;

create or replace function private.create_order_with_promotion(p_table_number text,p_customer_name text,p_items jsonb,p_expected_date date,p_expected_revision bigint,p_expected_discount_bps integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare quote jsonb; entry jsonb; price numeric; v_id uuid; v_number text;
begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception using errcode='22023',message='Productos inválidos'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception using errcode='22023',message='Cantidad de productos inválida'; end if;
  if exists(select 1 from jsonb_array_elements(p_items)e group by e->>'menu_item_id' having count(*)>1) then raise exception using errcode='22023',message='Producto repetido'; end if;
  -- Keep catalog prices stable between validation and insertion. No external calls under locks.
  perform 1 from public.menu_items mi join public.categories c on c.id=mi.category_id
    where mi.id in(select (e->>'menu_item_id')::uuid from jsonb_array_elements(p_items)e) order by mi.id for share of mi,c;
  for entry in select value from jsonb_array_elements(p_items) loop
    if coalesce(entry->>'quantity','') !~ '^[1-9][0-9]{0,2}$' then raise exception using errcode='22023',message='Cantidad inválida'; end if;
    select mi.price into price from public.menu_items mi join public.categories c on c.id=mi.category_id where mi.id=(entry->>'menu_item_id')::uuid and mi.active and c.active;
    if not found or entry->>'expected_unit_price' is null or price is distinct from (entry->>'expected_unit_price')::numeric then raise exception using errcode='40001',message='Un producto o precio cambió. Actualiza el menú y revisa el pedido'; end if;
  end loop;
  quote:=private.lock_current_promotion();
  if (quote->>'date')::date is distinct from p_expected_date or (quote->>'revision')::bigint is distinct from p_expected_revision or (quote->>'discount_bps')::integer is distinct from p_expected_discount_bps then
    raise exception using errcode='40001',message='La promoción cambió. Revisa el total actualizado antes de confirmar';
  end if;
  select o.order_id,o.order_number into v_id,v_number from private.create_customer_order(p_table_number,p_customer_name,auth.uid(),quote)o;
  for entry in select value from jsonb_array_elements(p_items) loop
    perform private.add_order_item(v_id,(entry->>'menu_item_id')::uuid,(entry->>'quantity')::integer,auth.uid());
  end loop;
  perform private.confirm_order(v_id,auth.uid());
  return (select jsonb_build_object('order_id',v_id,'order_number',v_number,'subtotal',o.subtotal,'discount_bps',o.discount_bps,'discount_amount',o.discount_amount,'total',o.total) from public.orders o where o.id=v_id);
end $$;
create or replace function public.create_order_with_promotion(p_table_number text,p_customer_name text,p_items jsonb,p_expected_date date,p_expected_revision bigint,p_expected_discount_bps integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.create_order_with_promotion(p_table_number,p_customer_name,p_items,p_expected_date,p_expected_revision,p_expected_discount_bps) $$;

revoke all on function private.promotion_for_instant(timestamptz),private.lock_current_promotion(),private.create_customer_order(text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.get_order_pricing_context(),private.admin_save_daily_promotion(date,integer,boolean,bigint),private.create_order_with_promotion(text,text,jsonb,date,bigint,integer) from public,anon;
grant execute on function private.get_order_pricing_context(),private.admin_save_daily_promotion(date,integer,boolean,bigint),private.create_order_with_promotion(text,text,jsonb,date,bigint,integer) to authenticated;
revoke all on function public.get_order_pricing_context(),public.admin_save_daily_promotion(date,integer,boolean,bigint),public.create_order_with_promotion(text,text,jsonb,date,bigint,integer) from public,anon;
grant execute on function public.get_order_pricing_context(),public.admin_save_daily_promotion(date,integer,boolean,bigint),public.create_order_with_promotion(text,text,jsonb,date,bigint,integer) to authenticated;
notify pgrst,'reload schema';
