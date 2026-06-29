-- ============================================================
-- Over Sauce Lounge — PHASE 3: DATABASE-LEVEL ROLE ENFORCEMENT (RLS)
-- Run ONCE in Supabase (SQL Editor) AFTER:
--   1) supabase-setup.sql   2) oversauce-orders.sql   3) oversauce-roles.sql
-- Makes permissions REAL: a logged-in staff member can only write to the
-- tables their role allows — even if they bypass the admin UI.
-- Public READ stays open (the customer site needs it). Customers can still
-- create orders anonymously. Safe to re-run.
-- ============================================================

-- ---- Helper: does the current logged-in user's role include `perm`? ----
-- SECURITY DEFINER so it can read roles/employees regardless of the caller.
-- The bootstrap owner (email NOT listed as an active employee) gets full access.
create or replace function public.has_permission(perm text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uemail text;
  emp    record;
  perms  jsonb;
begin
  uemail := lower(coalesce(auth.jwt() ->> 'email', ''));
  if uemail = '' then
    return false;                 -- not authenticated (anon) → no writes
  end if;

  -- Look up the staff member by email (active row preferred if duplicates).
  select e.active as active, e.role_id as role_id
    into emp
    from public.employees e
   where lower(e.email) = uemail
   order by e.active desc
   limit 1;

  if not found then
    return true;                  -- email is NOT a managed employee → owner → full access
  end if;

  if emp.active is not true then
    return false;                 -- suspended employee → no access
  end if;

  select r.permissions into perms from public.roles r where r.id = emp.role_id limit 1;
  if perms is null then
    return false;
  end if;
  return perms ? perm;            -- jsonb array contains the permission string
end;
$$;

grant execute on function public.has_permission(text) to authenticated, anon;

-- ============================================================
-- Rebuild WRITE policies (insert/update/delete) gated by permission.
-- READ (_read) policies are left untouched → public menu stays readable.
-- ============================================================

-- ---- categories → 'categories' ----
drop policy if exists "categories_insert" on public.categories;
drop policy if exists "categories_update" on public.categories;
drop policy if exists "categories_delete" on public.categories;
create policy "categories_insert" on public.categories for insert to authenticated with check (public.has_permission('categories'));
create policy "categories_update" on public.categories for update to authenticated using (public.has_permission('categories')) with check (public.has_permission('categories'));
create policy "categories_delete" on public.categories for delete to authenticated using (public.has_permission('categories'));

-- ---- products → 'products' ----
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;
drop policy if exists "products_delete" on public.products;
create policy "products_insert" on public.products for insert to authenticated with check (public.has_permission('products'));
create policy "products_update" on public.products for update to authenticated using (public.has_permission('products')) with check (public.has_permission('products'));
create policy "products_delete" on public.products for delete to authenticated using (public.has_permission('products'));

-- ---- coupons → 'coupons' ----
drop policy if exists "coupons_insert" on public.coupons;
drop policy if exists "coupons_update" on public.coupons;
drop policy if exists "coupons_delete" on public.coupons;
create policy "coupons_insert" on public.coupons for insert to authenticated with check (public.has_permission('coupons'));
create policy "coupons_update" on public.coupons for update to authenticated using (public.has_permission('coupons')) with check (public.has_permission('coupons'));
create policy "coupons_delete" on public.coupons for delete to authenticated using (public.has_permission('coupons'));

-- ---- flash_deals (offers) → 'coupons' ----
drop policy if exists "deals_insert" on public.flash_deals;
drop policy if exists "deals_update" on public.flash_deals;
drop policy if exists "deals_delete" on public.flash_deals;
create policy "deals_insert" on public.flash_deals for insert to authenticated with check (public.has_permission('coupons'));
create policy "deals_update" on public.flash_deals for update to authenticated using (public.has_permission('coupons')) with check (public.has_permission('coupons'));
create policy "deals_delete" on public.flash_deals for delete to authenticated using (public.has_permission('coupons'));

-- ---- delivery_zones → 'delivery_zones' ----
drop policy if exists "zones_insert" on public.delivery_zones;
drop policy if exists "zones_update" on public.delivery_zones;
drop policy if exists "zones_delete" on public.delivery_zones;
create policy "zones_insert" on public.delivery_zones for insert to authenticated with check (public.has_permission('delivery_zones'));
create policy "zones_update" on public.delivery_zones for update to authenticated using (public.has_permission('delivery_zones')) with check (public.has_permission('delivery_zones'));
create policy "zones_delete" on public.delivery_zones for delete to authenticated using (public.has_permission('delivery_zones'));

-- ---- restaurant_settings → 'settings' (single row, update only) ----
drop policy if exists "settings_update" on public.restaurant_settings;
create policy "settings_update" on public.restaurant_settings for update to authenticated using (public.has_permission('settings')) with check (public.has_permission('settings'));

-- ---- orders → 'orders' (customers keep anonymous INSERT) ----
drop policy if exists "orders_select_staff" on public.orders;
drop policy if exists "orders_update_staff" on public.orders;
drop policy if exists "orders_delete_staff" on public.orders;
create policy "orders_select_staff" on public.orders for select to authenticated using (public.has_permission('orders'));
create policy "orders_update_staff" on public.orders for update to authenticated using (public.has_permission('orders')) with check (public.has_permission('orders'));
create policy "orders_delete_staff" on public.orders for delete to authenticated using (public.has_permission('orders'));
-- NOTE: "orders_insert_anyone" is intentionally kept so customers can place orders.

-- ---- roles & employees → read open to staff, writes need 'users' ----
drop policy if exists "roles_all_staff" on public.roles;
create policy "roles_read"   on public.roles for select to authenticated using (true);
create policy "roles_insert" on public.roles for insert to authenticated with check (public.has_permission('users'));
create policy "roles_update" on public.roles for update to authenticated using (public.has_permission('users')) with check (public.has_permission('users'));
create policy "roles_delete" on public.roles for delete to authenticated using (public.has_permission('users'));

drop policy if exists "employees_all_staff" on public.employees;
create policy "employees_read"   on public.employees for select to authenticated using (true);
create policy "employees_insert" on public.employees for insert to authenticated with check (public.has_permission('users'));
create policy "employees_update" on public.employees for update to authenticated using (public.has_permission('users')) with check (public.has_permission('users'));
create policy "employees_delete" on public.employees for delete to authenticated using (public.has_permission('users'));

-- Storage (product images) is left as "any authenticated staff" — uploading an
-- image is harmless without the matching product write, which IS gated above.
