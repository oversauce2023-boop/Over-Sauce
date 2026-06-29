-- ============================================================
-- Over Sauce Lounge — Calories & Allergens migration
-- Run this ONCE in Supabase (SQL Editor) after the main setup.
-- Safe to re-run: uses "if not exists".
-- ============================================================

-- Calories per dish (optional number, e.g. 540)
alter table public.products
  add column if not exists calories integer;

-- Allergens list (array of text, e.g. {'جلوتين','ألبان'})
alter table public.products
  add column if not exists allergens text[] not null default '{}';

-- Done. The owner fills these per-dish from the admin panel.
