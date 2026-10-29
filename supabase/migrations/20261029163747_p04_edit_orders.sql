-- P04 depends on P01. Prepared for reviewed application, never auto-applied.
alter table public.orders add column revision bigint not null default 0;
create or replace function private.bump_order_revision()
returns trigger language plpgsql set search_path = '' as $$
begin new.revision := old.revision + 1; return new; end $$;
revoke all on function private.bump_order_revision() from public,anon,authenticated;
create trigger bump_order_revision before update on public.orders
  for each row execute function private.bump_order_revision();

create table private.order_edit_requests (
  request_id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  changes jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.order_edit_requests enable row level security;
revoke all on private.order_edit_requests from public,anon,authenticated;

create or replace function private.order_snapshot(p_order_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('order',to_jsonb(o),'items',coalesce((select jsonb_agg(to_jsonb(oi) order by oi.created_at,oi.id)
    from public.order_items oi where oi.order_id=o.id),'[]'::jsonb)) from public.orders o where o.id=p_order_id
$$;
revoke all on function private.order_snapshot(uuid) from public,anon,authenticated;

create or replace function private.get_order_edit_snapshot(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
  result := private.order_snapshot(p_order_id);
  if result is null then raise exception 'Pedido inexistente'; end if;
  return result;
end $$;
revoke all on function private.get_order_edit_snapshot(uuid) from public,anon;
grant execute on function private.get_order_edit_snapshot(uuid) to authenticated;
create or replace function public.get_order_edit_snapshot(p_order_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select private.get_order_edit_snapshot(p_order_id) $$;
revoke all on function public.get_order_edit_snapshot(uuid) from public,anon;
grant execute on function public.get_order_edit_snapshot(uuid) to authenticated;

create or replace function private.edit_order(p_order_id uuid,p_expected_revision bigint,p_changes jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; row public.orders; entry jsonb; prior private.order_edit_requests; price numeric; line public.order_items;
begin
  actor := private.assert_actor(array['admin','staff']::public.user_role[],auth.uid());
  if p_request_id is null or p_expected_revision is null then raise exception using errcode='22023',message='Falta versión o identificador de operación'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then raise exception using errcode='22023',message='Cambios inválidos'; end if;
  if jsonb_array_length(p_changes) not between 1 and 100 then raise exception using errcode='22023',message='Cantidad de cambios inválida'; end if;
  row := private.lock_order(p_order_id);
  select * into prior from private.order_edit_requests r where r.request_id=p_request_id;
  if found then
    if prior.actor_id <> actor or prior.order_id <> p_order_id or prior.changes <> p_changes then
      raise exception using errcode='22023',message='El identificador ya se usó para otra operación';
    end if;
    return private.order_snapshot(p_order_id);
  end if;
  if row.status in ('pagado','archivado') or row.paid_at is not null then raise exception 'El pedido está cobrado y no admite cambios'; end if;
  if row.revision <> p_expected_revision then raise exception using errcode='40001',message='El pedido cambió. Descarta y recarga los datos antes de guardar'; end if;
  if exists(select 1 from jsonb_array_elements(p_changes) e where e->>'action' in ('update','remove')
    group by e->>'order_item_id' having count(*)>1) then raise exception using errcode='22023',message='Producto repetido en los cambios'; end if;
  for entry in select value from jsonb_array_elements(p_changes) loop
    if entry->>'action' is null or entry->>'action' not in ('add','update','remove') then raise exception using errcode='22023',message='Acción inválida'; end if;
    if entry->>'action' <> 'remove' and coalesce(entry->>'quantity','') !~ '^[1-9][0-9]{0,2}$' then
      raise exception using errcode='22023',message='La cantidad debe ser un entero entre 1 y 999';
    end if;
    if entry->>'action' = 'add' then
      select mi.price into price from public.menu_items mi join public.categories c on c.id=mi.category_id
        where mi.id=(entry->>'menu_item_id')::uuid and mi.active and c.active;
      if not found or entry->>'expected_unit_price' is null or price is distinct from (entry->>'expected_unit_price')::numeric then
        raise exception using errcode='40001',message='El producto o su precio cambió. Descarta y recarga los datos';
      end if;
      perform private.add_order_item(p_order_id,(entry->>'menu_item_id')::uuid,(entry->>'quantity')::integer,actor);
    else
      select * into line from public.order_items oi where oi.id=(entry->>'order_item_id')::uuid and oi.order_id=p_order_id;
      if not found then raise exception 'El producto no pertenece a este pedido'; end if;
      perform private.update_order_item(line.id,case when entry->>'action'='remove' then null else (entry->>'quantity')::integer end,entry->>'action',actor);
    end if;
  end loop;
  if not exists(select 1 from public.order_items oi where oi.order_id=p_order_id and oi.status <> 'voided') then
    raise exception 'El pedido debe conservar al menos un producto';
  end if;
  if exists(select 1 from public.order_items oi where oi.order_id=p_order_id and oi.status='pending') then
    perform private.confirm_order(p_order_id,actor);
  else
    perform private.mark_order_delivered(p_order_id,actor);
  end if;
  insert into private.order_edit_requests(request_id,order_id,actor_id,changes) values(p_request_id,p_order_id,actor,p_changes);
  insert into public.order_events(order_id,actor_id,event_type,payload) values(p_order_id,actor,'order_edited',jsonb_build_object('request_id',p_request_id,'changes',p_changes));
  return private.order_snapshot(p_order_id);
end $$;
revoke all on function private.edit_order(uuid,bigint,jsonb,uuid) from public,anon;
grant execute on function private.edit_order(uuid,bigint,jsonb,uuid) to authenticated;
create or replace function public.edit_order(p_order_id uuid,p_expected_revision bigint,p_changes jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.edit_order(p_order_id,p_expected_revision,p_changes,p_request_id)
$$;
revoke all on function public.edit_order(uuid,bigint,jsonb,uuid) from public,anon;
grant execute on function public.edit_order(uuid,bigint,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
