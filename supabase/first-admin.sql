-- Run supabase/schema.sql first.
-- Then replace the values below with your first Supabase Auth admin user.

insert into public.profiles (id, email, name, role, active)
values (
  '89e02e88-c66f-4c46-86fe-2d3d4e2a10d3',
  'admin@example.com',
  'Main Admin',
  'admin',
  true
)
on conflict (id) do update
set
  email = excluded.email,
  name = excluded.name,
  role = excluded.role,
  active = excluded.active;
