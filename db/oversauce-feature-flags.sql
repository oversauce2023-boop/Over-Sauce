-- ============================================================
-- Over Sauce Lounge — FEATURE FLAGS
-- Run ONCE in Supabase (SQL Editor) after the main setup.
-- Lets the owner switch features on/off instantly from the admin.
-- Safe to re-run.
-- ============================================================

alter table public.restaurant_settings
  add column if not exists feature_flags jsonb not null default '{
    "coupons": true,
    "offers": true,
    "reviews": true,
    "delivery": true,
    "darkMode": true,
    "whatsappOrdering": true,
    "gallery": false,
    "loyalty": false,
    "notifications": false,
    "onlinePayments": false
  }'::jsonb;
