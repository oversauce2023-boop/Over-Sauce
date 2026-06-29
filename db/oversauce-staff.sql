-- ============================================================
-- Over Sauce Lounge — STAFF POS additions to orders
-- Run ONCE in Supabase (SQL Editor) after oversauce-orders.sql.
-- Adds table number, a separate invoice number, and the device string
-- so the manager always knows who/where/what for every staff order.
-- Safe to re-run.
-- ============================================================

create sequence if not exists public.invoice_number_seq start 1000;

alter table public.orders
  add column if not exists table_number text not null default '';

alter table public.orders
  add column if not exists invoice_number text not null default ('INV-' || nextval('public.invoice_number_seq')::text);

alter table public.orders
  add column if not exists device text not null default '';

-- Customers (anon) and staff (authenticated) both insert orders, so both
-- need to use the invoice sequence via the column default.
grant usage on sequence public.invoice_number_seq to anon, authenticated;
