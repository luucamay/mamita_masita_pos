insert into public.profiles (id, role, full_name)
values
  ('11111111-1111-1111-1111-111111111111', 'admin', 'Admin User'),
  ('22222222-2222-2222-2222-222222222222', 'staff', 'Staff User'),
  ('33333333-3333-3333-3333-333333333333', 'cook', 'Cook User'),
  ('44444444-4444-4444-4444-444444444444', 'barista', 'Barista User')
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    updated_at = now();

insert into public.categories (id, name, slug, queue_type, sort_order)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bebidas', 'bebidas', 'cafe', 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Sandwiches', 'sandwiches', 'kitchen', 2),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pizzas', 'pizzas', 'kitchen', 3)
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    queue_type = excluded.queue_type,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.menu_items (id, category_id, name, price, sort_order)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cappuccino', 18.50, 1),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Jamon y Queso', 22.00, 1),
  ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pizza Muzzarella', 35.00, 1)
on conflict (id) do update
set category_id = excluded.category_id,
    name = excluded.name,
    price = excluded.price,
    sort_order = excluded.sort_order,
    updated_at = now();
