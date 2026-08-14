create or replace function public.clear_order_history()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() is distinct from 'admin'::public.user_role then
    raise exception 'only active admins can clear order history';
  end if;

  delete from public.orders
  where id is not null;
end;
$$;

revoke execute on function public.clear_order_history() from public;
grant execute on function public.clear_order_history() to authenticated;
