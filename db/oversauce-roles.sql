-- ============================================================
-- Over Sauce Lounge — ROLES & EMPLOYEES (RBAC)
-- Run ONCE in Supabase (SQL Editor) after the main setup.
-- UI-level access control: each role controls which sections a
-- staff member can see. Safe to re-run.
-- ============================================================

create table if not exists public.roles (
  id          text primary key,
  name        text not null,
  permissions jsonb not null default '[]'::jsonb,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.employees (
  id         text primary key,
  name       text not null default '',
  email      text not null default '',
  role_id    text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Staff-only (authenticated) full access. No anonymous access.
alter table public.roles enable row level security;
alter table public.employees enable row level security;

drop policy if exists "roles_all_staff" on public.roles;
create policy "roles_all_staff" on public.roles
  for all to authenticated using (true) with check (true);

drop policy if exists "employees_all_staff" on public.employees;
create policy "employees_all_staff" on public.employees
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.employees to authenticated;

-- Seed the 5 default roles (kept if they already exist).
insert into public.roles (id, name, permissions, is_system) values
  ('super_admin', 'مدير عام',
    '["dashboard","orders","products","categories","coupons","delivery_zones","reviews","customers","reports","analytics","media","notifications","settings","users","backups","seo","theme"]'::jsonb, true),
  ('restaurant_manager', 'مدير المطعم',
    '["dashboard","orders","products","categories","coupons","reviews","customers","reports","analytics","media","notifications"]'::jsonb, true),
  ('cashier', 'كاشير',
    '["dashboard","orders","customers"]'::jsonb, true),
  ('product_manager', 'مدير المنتجات',
    '["dashboard","products","categories"]'::jsonb, true),
  ('marketing_manager', 'مدير التسويق',
    '["dashboard","coupons","media","notifications","seo","theme"]'::jsonb, true)
on conflict (id) do nothing;
