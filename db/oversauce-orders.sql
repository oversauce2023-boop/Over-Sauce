-- ============================================================
-- Over Sauce Lounge — ORDERS SYSTEM
-- Run ONCE in Supabase (SQL Editor) after the main setup.
-- Stores every order placed on the site BEFORE the WhatsApp redirect.
-- Safe to re-run.
-- ============================================================

-- Human-friendly order numbers: OS-1000, OS-1001, ...
create sequence if not exists public.order_number_seq start 1000;

create table if not exists public.orders (
  id                text primary key,
  order_number      text not null default ('OS-' || nextval('public.order_number_seq')::text),
  customer_name     text not null default '',
  phone             text not null default '',
  address           text not null default '',
  maps_link         text not null default '',
  order_type        text not null default 'delivery',   -- delivery | pickup
  zone              text not null default '',
  items             jsonb not null default '[]'::jsonb,  -- [{productId,name:{ar,en},size,extras,qty,unitPrice,lineTotal}]
  notes             text not null default '',
  coupon_code       text not null default '',
  discount          numeric(10,2) not null default 0,
  vat               numeric(10,2) not null default 0,
  delivery_fee      numeric(10,2) not null default 0,
  subtotal          numeric(10,2) not null default 0,
  grand_total       numeric(10,2) not null default 0,
  payment_method    text not null default 'cash',
  source            text not null default 'website',
  status            text not null default 'pending',     -- pending|confirmed|preparing|ready|out_for_delivery|delivered|cancelled
  assigned_employee text not null default '',
  timeline          jsonb not null default '[]'::jsonb,   -- [{type,from,to,note,by,at}]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_orders_created on public.orders(created_at desc);
create index if not exists idx_orders_status  on public.orders(status);

-- RLS: anyone (anon customer) can CREATE an order; only logged-in staff read/update/delete.
alter table public.orders enable row level security;

drop policy if exists "orders_insert_anyone" on public.orders;
create policy "orders_insert_anyone" on public.orders
  for insert to anon, authenticated with check (true);

drop policy if exists "orders_select_staff" on public.orders;
create policy "orders_select_staff" on public.orders
  for select to authenticated using (true);

drop policy if exists "orders_update_staff" on public.orders;
create policy "orders_update_staff" on public.orders
  for update to authenticated using (true) with check (true);

drop policy if exists "orders_delete_staff" on public.orders;
create policy "orders_delete_staff" on public.orders
  for delete to authenticated using (true);

-- Table/sequence privileges (RLS still applies on top of these)
grant insert on public.orders to anon;
grant select, insert, update, delete on public.orders to authenticated;
grant usage on sequence public.order_number_seq to anon, authenticated;

-- Live updates for the admin dashboard (guarded so re-runs don't error)
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;
