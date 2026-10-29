-- P05 requires P01. No Auth identities are inserted manually: creation uses Admin Auth API.
create table private.employee_provisions (
  request_id uuid primary key,
  email text not null unique,
  full_name text not null,
  role public.user_role not null,
  actor_id uuid not null references public.profiles(id),
  auth_user_id uuid,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.employee_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  employee_id uuid not null references public.profiles(id),
  action text not null,
  created_at timestamptz not null default now()
);
alter table private.employee_provisions enable row level security;
alter table private.employee_events enable row level security;
revoke all on private.employee_provisions,private.employee_events from public,anon,authenticated;

create or replace function private.admin_employee_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  actor := private.assert_actor(array['admin']::public.user_role[],auth.uid());
  -- Do not enable server-side Auth administration against the legacy broad grants.
  if has_table_privilege('authenticated','public.profiles','INSERT,UPDATE,DELETE')
     or has_any_column_privilege('authenticated','public.profiles','INSERT,UPDATE') then
    raise exception using errcode='55000',message='Administración de empleados no habilitada';
  end if;
  return jsonb_build_object('version',1,'actor_id',actor);
end $$;

create or replace function private.admin_prepare_employee(p_request_id uuid,p_email text,p_full_name text,p_role public.user_role)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; provision private.employee_provisions; v_email text:=lower(btrim(p_email)); v_name text:=btrim(p_full_name);
begin
  perform pg_advisory_xact_lock(20261029,5);
  perform private.admin_employee_context(); actor:=auth.uid();
  if p_request_id is null or v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254
     or v_name is null or length(v_name) not between 2 and 100 or p_role is null then
    raise exception using errcode='22023',message='Revisa nombre, correo y rol';
  end if;
  select * into provision from private.employee_provisions r where r.request_id=p_request_id;
  if found then
    if provision.email<>v_email or provision.full_name<>v_name or provision.role<>p_role then
      raise exception using errcode='22023',message='La operación ya corresponde a otros datos';
    end if;
    return to_jsonb(provision);
  end if;
  select * into provision from private.employee_provisions r where r.email=v_email;
  if found then
    if provision.completed or provision.full_name<>v_name or provision.role<>p_role then
      raise exception using errcode='23505',message='Ya existe un alta para ese correo';
    end if;
    -- A pending, tracked identity can be completed after a lost response or page reload.
    return to_jsonb(provision);
  end if;
  insert into private.employee_provisions(request_id,email,full_name,role,actor_id)
    values(p_request_id,v_email,v_name,p_role,actor) returning * into provision;
  return to_jsonb(provision);
end $$;

create or replace function private.admin_complete_employee(p_request_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare provision private.employee_provisions; profile public.profiles; actor uuid;
begin
  perform pg_advisory_xact_lock(20261029,5);
  perform private.admin_employee_context(); actor:=auth.uid();
  select * into provision from private.employee_provisions r where r.request_id=p_request_id for update;
  if not found then raise exception using errcode='22023',message='Alta inexistente'; end if;
  if provision.completed then
    if provision.auth_user_id is distinct from p_user_id then raise exception using errcode='22023',message='Identidad diferente'; end if;
    select * into profile from public.profiles where id=provision.auth_user_id;
    return to_jsonb(profile);
  end if;
  -- Only an identity marked by the server-side Admin Auth operation may receive this profile.
  if not exists(select 1 from auth.users u where u.id=p_user_id and lower(u.email)=provision.email
    and u.raw_app_meta_data->>'mamita_employee_request'=provision.request_id::text) then
    raise exception using errcode='42501',message='No se pudo verificar la identidad del alta';
  end if;
  if exists(select 1 from public.profiles p where p.id=p_user_id) then
    raise exception using errcode='23505',message='La cuenta ya tiene un perfil; no se modificó';
  end if;
  insert into public.profiles(id,full_name,role,active) values(p_user_id,provision.full_name,provision.role,true) returning * into profile;
  update private.employee_provisions set completed=true,auth_user_id=p_user_id,updated_at=now() where request_id=provision.request_id;
  insert into private.employee_events(actor_id,employee_id,action) values(actor,p_user_id,'created');
  return to_jsonb(profile);
end $$;

create or replace function private.admin_set_employee_active(p_employee_id uuid,p_active boolean,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; profile public.profiles;
begin
  -- Serialize admin lifecycle operations and recheck the actor AFTER acquiring the lock.
  perform pg_advisory_xact_lock(20261029,5);
  perform private.admin_employee_context(); actor:=auth.uid();
  select * into profile from public.profiles p where p.id=p_employee_id for update;
  if not found or p_active is null then raise exception using errcode='22023',message='Empleado inexistente o estado inválido'; end if;
  if profile.active=p_active then return to_jsonb(profile); end if;
  if p_expected_updated_at is null or profile.updated_at<>p_expected_updated_at then
    raise exception using errcode='40001',message='El perfil cambió. Actualiza la lista antes de continuar';
  end if;
  if not p_active and actor=p_employee_id then raise exception 'No puedes desactivar tu propia cuenta'; end if;
  if not p_active and profile.role='admin' and (select count(*) from public.profiles p where p.active and p.role='admin')<=1 then
    raise exception 'Debe conservarse al menos un administrador activo';
  end if;
  update public.profiles set active=p_active where id=p_employee_id returning * into profile;
  insert into private.employee_events(actor_id,employee_id,action) values(actor,p_employee_id,case when p_active then 'reactivated' else 'deactivated' end);
  return to_jsonb(profile);
end $$;

revoke all on function private.admin_employee_context(),private.admin_prepare_employee(uuid,text,text,public.user_role),private.admin_complete_employee(uuid,uuid),private.admin_set_employee_active(uuid,boolean,timestamptz) from public,anon;
grant execute on function private.admin_employee_context(),private.admin_prepare_employee(uuid,text,text,public.user_role),private.admin_complete_employee(uuid,uuid),private.admin_set_employee_active(uuid,boolean,timestamptz) to authenticated;

create or replace function public.admin_employee_context() returns jsonb language sql security invoker set search_path='' as $$ select private.admin_employee_context() $$;
create or replace function public.admin_prepare_employee(p_request_id uuid,p_email text,p_full_name text,p_role public.user_role) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_prepare_employee(p_request_id,p_email,p_full_name,p_role) $$;
create or replace function public.admin_complete_employee(p_request_id uuid,p_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_complete_employee(p_request_id,p_user_id) $$;
create or replace function public.admin_set_employee_active(p_employee_id uuid,p_active boolean,p_expected_updated_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_set_employee_active(p_employee_id,p_active,p_expected_updated_at) $$;
revoke all on function public.admin_employee_context(),public.admin_prepare_employee(uuid,text,text,public.user_role),public.admin_complete_employee(uuid,uuid),public.admin_set_employee_active(uuid,boolean,timestamptz) from public,anon;
grant execute on function public.admin_employee_context(),public.admin_prepare_employee(uuid,text,text,public.user_role),public.admin_complete_employee(uuid,uuid),public.admin_set_employee_active(uuid,boolean,timestamptz) to authenticated;
notify pgrst,'reload schema';

