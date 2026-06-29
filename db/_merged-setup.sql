-- =====================================================================
-- Over Sauce Lounge — ملف التثبيت الكامل المدموج (All-in-One)
-- =====================================================================
-- شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor → Run
-- يجمع كل ملفات db/ بالترتيب الصحيح للاعتماديات.
-- ✅ آمن لإعادة التشغيل أكثر من مرة (idempotent).
-- ✅ ينشئ: الجداول + المنيو الحقيقي + الطلبات + الكاشير + الأدوار + الحماية.
--
-- بعد التشغيل، شغّل ملف الفحص (01-فحص-الحالة.sql) للتأكد إن كله ✅.
-- =====================================================================

-- =====================================================================
-- القسم 1/8 — الجداول الأساسية + الحماية + الستوريج
-- (من ملف: supabase-setup.sql)
-- =====================================================================
-- =====================================================================
-- Over Sauce Lounge — Supabase Setup  (السكيمة + الحماية + الستوريج)
-- =====================================================================
-- شغّل هذا الملف كامل مرة واحدة في:
--   Supabase Dashboard → SQL Editor → New query → Run
-- ثم شغّل بعده ملف  supabase-seed.sql  (مرة واحدة) لملء البيانات.
--
-- هذا الملف آمن لإعادة التشغيل في أي وقت (idempotent): كل شيء يستخدم
-- IF NOT EXISTS / DROP ... IF EXISTS، ولن يلمس بياناتك الموجودة.
--
-- ★ نموذج الحماية (مهم جداً) ★
--   • القراءة عامة للجميع (الموقع يحتاجها) عبر سياسة select using(true).
--   • الكتابة (إضافة/تعديل/حذف) **مسموحة فقط للمستخدم المسجّل دخول**
--     عبر Supabase Auth (دور authenticated).
--   • في الواجهة (frontend) تُستخدم anon key فقط — وهي عامة وآمنة بحكم
--     التصميم. ❌ لا تضع service_role key في كود الموقع إطلاقاً (سيُكشف
--     لأي زائر ويمنحه صلاحية مسح/تعديل كل البيانات).
--   • صاحب المطعم يسجّل دخول لوحة الأدمن بإيميل/باسورد حقيقيين تُنشئهما
--     أنت من لوحة Supabase (راجع تعليمات آخر الملف).
-- =====================================================================


-- =====================================================================
-- 1) الجداول
-- =====================================================================

-- ---------- 1.1 الفئات ----------
create table if not exists public.categories (
  id          text primary key,
  icon        text not null default '🍽️',
  name_ar     text not null,
  name_en     text not null,
  sort_order  integer not null default 1,
  created_at  timestamptz not null default now()
);

-- ---------- 1.2 الأطباق ----------
-- sizes/extras مخزّنة JSONB بنفس شكل الأبليكيشن تماماً:
--   sizes  : [{ "id": "...", "name": {"ar":"...","en":"..."}, "priceDiff":  0 }]
--   extras : [{ "id": "...", "name": {"ar":"...","en":"..."}, "price":      0 }]
create table if not exists public.products (
  id              text primary key,
  category_id     text not null references public.categories(id) on delete cascade,
  name_ar         text not null,
  name_en         text not null,
  description_ar  text not null default '',
  description_en  text not null default '',
  price           numeric(10,2) not null check (price >= 0),
  old_price       numeric(10,2),
  image_url       text not null default '',
  badges          text[] not null default '{}',          -- {'new','best','spicy'}
  rating          numeric(2,1) not null default 4.5,
  orders_count    integer not null default 0,
  in_stock        boolean not null default true,
  sizes           jsonb not null default '[]'::jsonb,
  extras          jsonb not null default '[]'::jsonb,
  sort_order      integer not null default 0,            -- ترتيب العرض داخل الفئة
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_products_category on public.products(category_id);

-- ---------- 1.3 الكوبونات ----------
create table if not exists public.coupons (
  code        text primary key,
  type        text not null check (type in ('percentage','fixed')),
  value       numeric(10,2) not null check (value >= 0),
  min_order   numeric(10,2) not null default 0,
  label_ar    text not null default '',
  label_en    text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- 1.4 العروض (Flash Deals) ----------
-- شريط العروض الذي يظهر في الصفحة الرئيسية، يديره صاحب المطعم من اللوحة.
create table if not exists public.flash_deals (
  id               text primary key,
  title_ar         text not null,
  title_en         text not null,
  subtitle_ar      text not null default '',
  subtitle_en      text not null default '',
  discount_percent integer not null default 0,
  ends_in_hours    integer not null default 24,
  active           boolean not null default true,
  sort_order       integer not null default 1,
  created_at       timestamptz not null default now()
);

-- ---------- 1.5 مناطق التوصيل ----------
create table if not exists public.delivery_zones (
  id           text primary key,
  name_ar      text not null,
  name_en      text not null,
  fee          numeric(10,2) not null default 0,
  eta_minutes  integer not null default 30,
  sort_order   integer not null default 1,
  created_at   timestamptz not null default now()
);

-- ---------- 1.6 إعدادات المطعم (صف واحد دائماً id=1) ----------
create table if not exists public.restaurant_settings (
  id                   integer primary key default 1,
  name_ar              text not null default 'Over Sauce Lounge',
  name_en              text not null default 'Over Sauce Lounge',
  tagline_ar           text not null default '',
  tagline_en           text not null default '',
  whatsapp_number      text not null default '',
  phone                text not null default '',
  address_ar           text not null default '',
  address_en           text not null default '',
  opening_hours_ar     text not null default '',
  opening_hours_en     text not null default '',
  maps_url             text not null default '',
  instagram_url        text not null default '',
  tiktok_url           text not null default '',
  whatsapp_channel_url text not null default '',
  years_experience     integer not null default 0,
  happy_customers      integer not null default 0,
  menu_items_count     integer not null default 0,
  average_rating       numeric(2,1) not null default 4.8,
  minimum_order        numeric(10,2) not null default 0,
  currency             text not null default 'ر.س',
  orders_paused        boolean not null default false,   -- زر "إيقاف الطلبات" المؤقت
  updated_at           timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.restaurant_settings (id) values (1)
  on conflict (id) do nothing;


-- =====================================================================
-- 2) تحديث updated_at تلقائياً عند أي تعديل
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated on public.restaurant_settings;
create trigger trg_settings_updated
  before update on public.restaurant_settings
  for each row execute function public.set_updated_at();


-- =====================================================================
-- 3) تفعيل الحماية على مستوى الصفوف (Row Level Security)
-- =====================================================================
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.coupons             enable row level security;
alter table public.flash_deals         enable row level security;
alter table public.delivery_zones      enable row level security;
alter table public.restaurant_settings enable row level security;


-- =====================================================================
-- 4) السياسات
--   قراءة عامة للجميع  +  كتابة للمسجّلين فقط (authenticated)
--   (نحذف السياسة إن وُجدت أولاً حتى يكون الملف قابلاً لإعادة التشغيل)
-- =====================================================================

-- دالة مساعدة مختصرة عبر تكرار يدوي لكل جدول:

-- ---- categories ----
drop policy if exists "categories_read"   on public.categories;
drop policy if exists "categories_insert" on public.categories;
drop policy if exists "categories_update" on public.categories;
drop policy if exists "categories_delete" on public.categories;
create policy "categories_read"   on public.categories for select using (true);
drop policy if exists "categories_insert" on public.categories;
create policy "categories_insert" on public.categories for insert to authenticated with check (true);
drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories for update to authenticated using (true) with check (true);
drop policy if exists "categories_delete" on public.categories;
create policy "categories_delete" on public.categories for delete to authenticated using (true);

-- ---- products ----
drop policy if exists "products_read"   on public.products;
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;
drop policy if exists "products_delete" on public.products;
create policy "products_read"   on public.products for select using (true);
drop policy if exists "products_insert" on public.products;
create policy "products_insert" on public.products for insert to authenticated with check (true);
drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products for update to authenticated using (true) with check (true);
drop policy if exists "products_delete" on public.products;
create policy "products_delete" on public.products for delete to authenticated using (true);

-- ---- coupons ----
drop policy if exists "coupons_read"   on public.coupons;
drop policy if exists "coupons_insert" on public.coupons;
drop policy if exists "coupons_update" on public.coupons;
drop policy if exists "coupons_delete" on public.coupons;
create policy "coupons_read"   on public.coupons for select using (true);
drop policy if exists "coupons_insert" on public.coupons;
create policy "coupons_insert" on public.coupons for insert to authenticated with check (true);
drop policy if exists "coupons_update" on public.coupons;
create policy "coupons_update" on public.coupons for update to authenticated using (true) with check (true);
drop policy if exists "coupons_delete" on public.coupons;
create policy "coupons_delete" on public.coupons for delete to authenticated using (true);

-- ---- flash_deals ----
drop policy if exists "deals_read"   on public.flash_deals;
drop policy if exists "deals_insert" on public.flash_deals;
drop policy if exists "deals_update" on public.flash_deals;
drop policy if exists "deals_delete" on public.flash_deals;
create policy "deals_read"   on public.flash_deals for select using (true);
drop policy if exists "deals_insert" on public.flash_deals;
create policy "deals_insert" on public.flash_deals for insert to authenticated with check (true);
drop policy if exists "deals_update" on public.flash_deals;
create policy "deals_update" on public.flash_deals for update to authenticated using (true) with check (true);
drop policy if exists "deals_delete" on public.flash_deals;
create policy "deals_delete" on public.flash_deals for delete to authenticated using (true);

-- ---- delivery_zones ----
drop policy if exists "zones_read"   on public.delivery_zones;
drop policy if exists "zones_insert" on public.delivery_zones;
drop policy if exists "zones_update" on public.delivery_zones;
drop policy if exists "zones_delete" on public.delivery_zones;
create policy "zones_read"   on public.delivery_zones for select using (true);
drop policy if exists "zones_insert" on public.delivery_zones;
create policy "zones_insert" on public.delivery_zones for insert to authenticated with check (true);
drop policy if exists "zones_update" on public.delivery_zones;
create policy "zones_update" on public.delivery_zones for update to authenticated using (true) with check (true);
drop policy if exists "zones_delete" on public.delivery_zones;
create policy "zones_delete" on public.delivery_zones for delete to authenticated using (true);

-- ---- restaurant_settings ----
-- لا حذف للإعدادات (صف واحد دائم) — قراءة عامة + تعديل للمسجّلين فقط.
drop policy if exists "settings_read"   on public.restaurant_settings;
drop policy if exists "settings_update" on public.restaurant_settings;
create policy "settings_read"   on public.restaurant_settings for select using (true);
drop policy if exists "settings_update" on public.restaurant_settings;
create policy "settings_update" on public.restaurant_settings for update to authenticated using (true) with check (true);


-- =====================================================================
-- 5) الستوريج (تخزين صور الأطباق)
--   ننشئ bucket عام اسمه product-images: قراءة عامة + رفع/حذف للمسجّلين.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
drop policy if exists "product_images_auth_insert" on storage.objects;
drop policy if exists "product_images_auth_update" on storage.objects;
drop policy if exists "product_images_auth_delete" on storage.objects;

create policy "product_images_public_read"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "product_images_auth_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images');

create policy "product_images_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product_images_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images');


-- =====================================================================
-- 6) التحديث اللحظي (Realtime)
--   لما صاحب المطعم يغيّر سعراً أو يوقف الطلبات، التابات المفتوحة عند
--   الزباين تتحدّث فوراً. (ملفوفة في DO لتجاهل "مضافة مسبقاً" عند الإعادة)
-- =====================================================================
do $$ begin alter publication supabase_realtime add table public.products;            exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.categories;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.coupons;             exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.flash_deals;         exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.delivery_zones;      exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.restaurant_settings; exception when duplicate_object then null; end $$;


-- =====================================================================
-- ✅ تم إعداد القاعدة والحماية.
--
-- الخطوات اليدوية المتبقية (مرة واحدة، من لوحة Supabase):
--
-- 1) شغّل ملف  supabase-seed.sql  لملء البيانات (الفئات والأطباق...).
--
-- 2) أنشئ حساب صاحب المطعم (للوحة الأدمن):
--      Authentication → Users → Add user
--      أدخل إيميل وباسورد قويين → Create user.
--      (هذا هو الحساب الذي سيسجّل به الدخول للوحة بدلاً من الـ PIN القديم.)
--
-- 3) أغلق التسجيل العام حتى لا ينشئ أحد حساباً بنفسه:
--      Authentication → Sign In / Providers (أو Settings)
--      عطّل "Allow new users to sign up".
--      بهذا يبقى "أي مستخدم مسجّل = صاحب المطعم" فقط.
--
-- 4) خُذ من:  Project Settings → API
--      • Project URL
--      • anon public key
--    وضعهما في ملف إعداد الواجهة (سنجهّزه في الخطوة التالية: js/config.js).
--
-- — ملاحظة أمان إضافية (اختياري): لو رغبت بحصر الكتابة على إيميل محدد
--   بدلاً من أي مسجّل، استبدل  to authenticated using (true)  بشرط مثل:
--      using ( (auth.jwt() ->> 'email') = 'owner@example.com' )
--   في سياسات insert/update/delete بالأعلى.
-- =====================================================================


-- =====================================================================
-- القسم 2/8 — أعمدة السعرات والحساسية
-- (من ملف: oversauce-calories-allergens.sql)
-- =====================================================================
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


-- =====================================================================
-- القسم 3/8 — المنيو الحقيقي
-- (من ملف: oversauce-menu.sql)
-- =====================================================================
-- ============================================================
-- Over Sauce Lounge — REAL MENU (categories + dishes) — COMPLETE
-- Run in Supabase SQL Editor to replace the demo menu.
-- Run AFTER the calories/allergens migration.
-- ============================================================

begin;
delete from public.products;
delete from public.categories;

insert into public.categories (id, icon, name_ar, name_en, sort_order) values
  ('breakfast', '🍳', 'الفطار', 'Breakfast', 1),
  ('manakish', '🫓', 'مناقيش', 'Manakish', 2),
  ('pizza', '🍕', 'بيتزا', 'Pizza', 3),
  ('pasta', '🍝', 'الباستا', 'Pasta', 4),
  ('soup', '🍲', 'شوربة', 'Soups', 5),
  ('drinks', '🥤', 'مشروبات', 'Drinks', 6);

insert into public.products (id, category_id, name_ar, name_en, description_ar, description_en, price, image_url, sort_order) values
  ('bf1', 'breakfast', 'قطعتين فطير قشدة عسل مربى', 'Two Fteer with Cream, Honey & Jam', 'قطعتين فطير مشلتت طازج محشي قشطة، يُقدّم مع عسل ومربى.', 'Two pieces of fresh flaky fteer filled with cream, served with honey and jam.', 30, '/assets/images/fteer-cream-honey.jpg', 1),
  ('bf2', 'breakfast', 'بيض أومليت', 'Omelette', 'أومليت بيض طازج مع الخضار، يُقدّم ساخناً مع الخبز.', 'Fresh egg omelette with vegetables, served hot with bread.', 12, '/assets/images/omelette.jpg', 2),
  ('mn1', 'manakish', 'مناقيش جبنة بالعسل', 'Cheese & Honey Manakish', 'عجينة طازجة بجبنة موزاريلا ولمسة عسل، مخبوزة في الفرن.', 'Fresh dough with mozzarella cheese and a touch of honey, oven-baked.', 20, '/assets/images/manakish-cheese-honey.jpg', 1),
  ('pz1', 'pizza', 'بيتزا خضار', 'Vegetable Pizza', 'بيتزا بعجينة طازجة وخضار ملوّنة وجبنة موزاريلا.', 'Pizza with fresh dough, colorful vegetables and mozzarella cheese.', 32, '/assets/images/pizza-veg.jpg', 1),
  ('pa1', 'pasta', 'فرايد شرمب', 'Fried Shrimp', 'جمبري مقرمش مقلي بتتبيلة خاصة، يُقدّم مع صوص جانبي.', 'Crispy fried shrimp with a special seasoning, served with a side sauce.', 50, '/assets/images/fried-shrimp.jpg', 1),
  ('sp1', 'soup', 'شوربة عدس', 'Lentil Soup', 'شوربة عدس كريمية ساخنة بنكهة غنية، تُقدّم مع الليمون.', 'Warm creamy lentil soup with a rich flavor, served with lemon.', 18, '/assets/images/lentil-soup.jpg', 1),
  ('dr1', 'drinks', 'موهيتو كود ريد', 'Mojito Code Red', 'موهيتو كود ريد المنعش بالنعناع والليمون ولمسة من التوت الأحمر.', 'Refreshing Code Red mojito with mint, lime and a hint of red berries.', 27, '/assets/images/mojito.jpg', 1);

commit;


-- =====================================================================
-- القسم 4/8 — نظام الطلبات
-- (من ملف: oversauce-orders.sql)
-- =====================================================================
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


-- =====================================================================
-- القسم 5/8 — إضافات الكاشير (طاولة/فاتورة)
-- (من ملف: oversauce-staff.sql)
-- =====================================================================
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


-- =====================================================================
-- القسم 6/8 — الأدوار والموظفين
-- (من ملف: oversauce-roles.sql)
-- =====================================================================
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


-- =====================================================================
-- القسم 7/8 — الحماية الحقيقية (RLS)
-- (من ملف: oversauce-rls-roles.sql)
-- =====================================================================
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
drop policy if exists "categories_insert" on public.categories;
create policy "categories_insert" on public.categories for insert to authenticated with check (public.has_permission('categories'));
drop policy if exists "categories_update" on public.categories;
create policy "categories_update" on public.categories for update to authenticated using (public.has_permission('categories')) with check (public.has_permission('categories'));
drop policy if exists "categories_delete" on public.categories;
create policy "categories_delete" on public.categories for delete to authenticated using (public.has_permission('categories'));

-- ---- products → 'products' ----
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;
drop policy if exists "products_delete" on public.products;
drop policy if exists "products_insert" on public.products;
create policy "products_insert" on public.products for insert to authenticated with check (public.has_permission('products'));
drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products for update to authenticated using (public.has_permission('products')) with check (public.has_permission('products'));
drop policy if exists "products_delete" on public.products;
create policy "products_delete" on public.products for delete to authenticated using (public.has_permission('products'));

-- ---- coupons → 'coupons' ----
drop policy if exists "coupons_insert" on public.coupons;
drop policy if exists "coupons_update" on public.coupons;
drop policy if exists "coupons_delete" on public.coupons;
drop policy if exists "coupons_insert" on public.coupons;
create policy "coupons_insert" on public.coupons for insert to authenticated with check (public.has_permission('coupons'));
drop policy if exists "coupons_update" on public.coupons;
create policy "coupons_update" on public.coupons for update to authenticated using (public.has_permission('coupons')) with check (public.has_permission('coupons'));
drop policy if exists "coupons_delete" on public.coupons;
create policy "coupons_delete" on public.coupons for delete to authenticated using (public.has_permission('coupons'));

-- ---- flash_deals (offers) → 'coupons' ----
drop policy if exists "deals_insert" on public.flash_deals;
drop policy if exists "deals_update" on public.flash_deals;
drop policy if exists "deals_delete" on public.flash_deals;
drop policy if exists "deals_insert" on public.flash_deals;
create policy "deals_insert" on public.flash_deals for insert to authenticated with check (public.has_permission('coupons'));
drop policy if exists "deals_update" on public.flash_deals;
create policy "deals_update" on public.flash_deals for update to authenticated using (public.has_permission('coupons')) with check (public.has_permission('coupons'));
drop policy if exists "deals_delete" on public.flash_deals;
create policy "deals_delete" on public.flash_deals for delete to authenticated using (public.has_permission('coupons'));

-- ---- delivery_zones → 'delivery_zones' ----
drop policy if exists "zones_insert" on public.delivery_zones;
drop policy if exists "zones_update" on public.delivery_zones;
drop policy if exists "zones_delete" on public.delivery_zones;
drop policy if exists "zones_insert" on public.delivery_zones;
create policy "zones_insert" on public.delivery_zones for insert to authenticated with check (public.has_permission('delivery_zones'));
drop policy if exists "zones_update" on public.delivery_zones;
create policy "zones_update" on public.delivery_zones for update to authenticated using (public.has_permission('delivery_zones')) with check (public.has_permission('delivery_zones'));
drop policy if exists "zones_delete" on public.delivery_zones;
create policy "zones_delete" on public.delivery_zones for delete to authenticated using (public.has_permission('delivery_zones'));

-- ---- restaurant_settings → 'settings' (single row, update only) ----
drop policy if exists "settings_update" on public.restaurant_settings;
create policy "settings_update" on public.restaurant_settings for update to authenticated using (public.has_permission('settings')) with check (public.has_permission('settings'));

-- ---- orders → 'orders' (customers keep anonymous INSERT) ----
drop policy if exists "orders_select_staff" on public.orders;
drop policy if exists "orders_update_staff" on public.orders;
drop policy if exists "orders_delete_staff" on public.orders;
drop policy if exists "orders_select_staff" on public.orders;
create policy "orders_select_staff" on public.orders for select to authenticated using (public.has_permission('orders'));
drop policy if exists "orders_update_staff" on public.orders;
create policy "orders_update_staff" on public.orders for update to authenticated using (public.has_permission('orders')) with check (public.has_permission('orders'));
drop policy if exists "orders_delete_staff" on public.orders;
create policy "orders_delete_staff" on public.orders for delete to authenticated using (public.has_permission('orders'));
-- NOTE: "orders_insert_anyone" is intentionally kept so customers can place orders.

-- ---- roles & employees → read open to staff, writes need 'users' ----
drop policy if exists "roles_all_staff" on public.roles;
create policy "roles_read"   on public.roles for select to authenticated using (true);
drop policy if exists "roles_insert" on public.roles;
create policy "roles_insert" on public.roles for insert to authenticated with check (public.has_permission('users'));
drop policy if exists "roles_update" on public.roles;
create policy "roles_update" on public.roles for update to authenticated using (public.has_permission('users')) with check (public.has_permission('users'));
drop policy if exists "roles_delete" on public.roles;
create policy "roles_delete" on public.roles for delete to authenticated using (public.has_permission('users'));

drop policy if exists "employees_all_staff" on public.employees;
create policy "employees_read"   on public.employees for select to authenticated using (true);
drop policy if exists "employees_insert" on public.employees;
create policy "employees_insert" on public.employees for insert to authenticated with check (public.has_permission('users'));
drop policy if exists "employees_update" on public.employees;
create policy "employees_update" on public.employees for update to authenticated using (public.has_permission('users')) with check (public.has_permission('users'));
drop policy if exists "employees_delete" on public.employees;
create policy "employees_delete" on public.employees for delete to authenticated using (public.has_permission('users'));

-- Storage (product images) is left as "any authenticated staff" — uploading an
-- image is harmless without the matching product write, which IS gated above.


-- =====================================================================
-- القسم 8/8 — مفاتيح المميزات
-- (من ملف: oversauce-feature-flags.sql)
-- =====================================================================
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

