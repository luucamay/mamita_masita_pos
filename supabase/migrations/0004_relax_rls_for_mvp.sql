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

create policy profiles_select_authenticated on public.profiles
for select
using (auth.uid() is not null);

create policy profiles_update_authenticated on public.profiles
for update
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy categories_select_authenticated on public.categories
for select
using (auth.uid() is not null);

create policy categories_write_authenticated on public.categories
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy menu_items_select_authenticated on public.menu_items
for select
using (auth.uid() is not null);

create policy menu_items_write_authenticated on public.menu_items
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy orders_select_authenticated on public.orders
for select
using (auth.uid() is not null);

create policy orders_write_authenticated on public.orders
for insert
with check (auth.uid() is not null);

create policy orders_update_authenticated on public.orders
for update
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy order_items_select_authenticated on public.order_items
for select
using (auth.uid() is not null);

create policy order_items_write_authenticated on public.order_items
for insert
with check (auth.uid() is not null);

create policy order_items_update_authenticated on public.order_items
for update
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy order_items_delete_authenticated on public.order_items
for delete
using (auth.uid() is not null);

create policy order_payments_select_authenticated on public.order_payments
for select
using (auth.uid() is not null);

create policy order_payments_write_authenticated on public.order_payments
for insert
with check (auth.uid() is not null);

create policy order_events_select_authenticated on public.order_events
for select
using (auth.uid() is not null);

create policy order_events_write_authenticated on public.order_events
for insert
with check (auth.uid() is not null);

create policy print_jobs_select_authenticated on public.print_jobs
for select
using (auth.uid() is not null);

create policy print_jobs_write_authenticated on public.print_jobs
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
