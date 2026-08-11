drop policy if exists profiles_select_self_or_admin on public.profiles;
drop policy if exists profiles_update_self_or_admin on public.profiles;
drop policy if exists categories_select_authenticated on public.categories;
drop policy if exists categories_write_admin on public.categories;
drop policy if exists menu_items_select_authenticated on public.menu_items;
drop policy if exists menu_items_write_admin on public.menu_items;
drop policy if exists orders_select_authenticated on public.orders;
drop policy if exists orders_write_staff_admin on public.orders;
drop policy if exists orders_update_staff_admin on public.orders;
drop policy if exists order_items_select_authenticated on public.order_items;
drop policy if exists order_items_write_staff_admin on public.order_items;
drop policy if exists order_items_update_staff_admin on public.order_items;
drop policy if exists order_items_delete_staff_admin on public.order_items;
drop policy if exists order_payments_select_staff_admin on public.order_payments;
drop policy if exists order_payments_write_staff_admin on public.order_payments;
drop policy if exists order_events_select_authenticated on public.order_events;
drop policy if exists order_events_write_authenticated on public.order_events;
drop policy if exists print_jobs_select_cook_admin on public.print_jobs;
drop policy if exists print_jobs_write_cook_admin on public.print_jobs;

-- Role lookup must bypass the profiles policy that uses it, while remaining
-- limited to the current authenticated user's row.
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active = true
  limit 1
$$;
revoke execute on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

create policy profiles_select_self_or_admin on public.profiles
for select using (id = auth.uid() or public.has_role(array['admin']::public.user_role[]));
create policy profiles_update_self_or_admin on public.profiles
for update using (id = auth.uid() or public.has_role(array['admin']::public.user_role[]))
with check (id = auth.uid() or public.has_role(array['admin']::public.user_role[]));

create policy categories_select_authenticated on public.categories
for select using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));
create policy categories_write_admin on public.categories
for all using (public.has_role(array['admin']::public.user_role[]))
with check (public.has_role(array['admin']::public.user_role[]));

create policy menu_items_select_authenticated on public.menu_items
for select using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));
create policy menu_items_write_admin on public.menu_items
for all using (public.has_role(array['admin']::public.user_role[]))
with check (public.has_role(array['admin']::public.user_role[]));

create policy orders_select_authenticated on public.orders
for select using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));
create policy orders_write_staff_admin on public.orders
for insert with check (public.has_role(array['admin','staff']::public.user_role[]));
create policy orders_update_staff_admin on public.orders
for update using (public.has_role(array['admin','staff']::public.user_role[]))
with check (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_items_select_authenticated on public.order_items
for select using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));
create policy order_items_write_staff_admin on public.order_items
for insert with check (public.has_role(array['admin','staff']::public.user_role[]));
create policy order_items_update_staff_admin on public.order_items
for update using (public.has_role(array['admin','staff']::public.user_role[]))
with check (public.has_role(array['admin','staff']::public.user_role[]));
create policy order_items_delete_staff_admin on public.order_items
for delete using (public.has_role(array['admin','staff']::public.user_role[]));

create policy order_payments_select_staff_admin on public.order_payments
for select using (public.has_role(array['admin','staff']::public.user_role[]));
create policy order_payments_write_staff_admin on public.order_payments
for insert with check (public.has_role(array['admin','staff']::public.user_role[]));
create policy order_events_select_authenticated on public.order_events
for select using (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));
create policy order_events_write_authenticated on public.order_events
for insert with check (public.has_role(array['admin','staff','cook','barista']::public.user_role[]));
create policy print_jobs_select_cook_admin on public.print_jobs
for select using (public.has_role(array['admin','cook','staff']::public.user_role[]));
create policy print_jobs_write_cook_admin on public.print_jobs
for all using (public.has_role(array['admin','cook']::public.user_role[]))
with check (public.has_role(array['admin','cook']::public.user_role[]));
