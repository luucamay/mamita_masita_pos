-- RLS checks for the main role boundaries.

begin;

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set local request.jwt.claim.role = 'authenticated';

do $$
begin
  begin
    insert into public.menu_items (category_id, name, price)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bad Write', 1.00);
    raise exception 'menu write should have been blocked';
  exception
    when insufficient_privilege then
      null;
    when others then
      null;
  end;
end $$;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';

do $$
declare
  v_allowed boolean := false;
begin
  begin
    perform * from public.v_cafe_queue limit 1;
    v_allowed := true;
  exception
    when others then
      v_allowed := false;
  end;

  if not v_allowed then
    raise exception 'barista should be able to read cafe queue';
  end if;
end $$;

rollback;
