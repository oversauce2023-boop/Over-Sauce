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
create policy "categories_insert" on public.categories for insert to authenticated with check (true);
create policy "categories_update" on public.categories for update to authenticated using (true) with check (true);
create policy "categories_delete" on public.categories for delete to authenticated using (true);

-- ---- products ----
drop policy if exists "products_read"   on public.products;
drop policy if exists "products_insert" on public.products;
drop policy if exists "products_update" on public.products;
drop policy if exists "products_delete" on public.products;
create policy "products_read"   on public.products for select using (true);
create policy "products_insert" on public.products for insert to authenticated with check (true);
create policy "products_update" on public.products for update to authenticated using (true) with check (true);
create policy "products_delete" on public.products for delete to authenticated using (true);

-- ---- coupons ----
drop policy if exists "coupons_read"   on public.coupons;
drop policy if exists "coupons_insert" on public.coupons;
drop policy if exists "coupons_update" on public.coupons;
drop policy if exists "coupons_delete" on public.coupons;
create policy "coupons_read"   on public.coupons for select using (true);
create policy "coupons_insert" on public.coupons for insert to authenticated with check (true);
create policy "coupons_update" on public.coupons for update to authenticated using (true) with check (true);
create policy "coupons_delete" on public.coupons for delete to authenticated using (true);

-- ---- flash_deals ----
drop policy if exists "deals_read"   on public.flash_deals;
drop policy if exists "deals_insert" on public.flash_deals;
drop policy if exists "deals_update" on public.flash_deals;
drop policy if exists "deals_delete" on public.flash_deals;
create policy "deals_read"   on public.flash_deals for select using (true);
create policy "deals_insert" on public.flash_deals for insert to authenticated with check (true);
create policy "deals_update" on public.flash_deals for update to authenticated using (true) with check (true);
create policy "deals_delete" on public.flash_deals for delete to authenticated using (true);

-- ---- delivery_zones ----
drop policy if exists "zones_read"   on public.delivery_zones;
drop policy if exists "zones_insert" on public.delivery_zones;
drop policy if exists "zones_update" on public.delivery_zones;
drop policy if exists "zones_delete" on public.delivery_zones;
create policy "zones_read"   on public.delivery_zones for select using (true);
create policy "zones_insert" on public.delivery_zones for insert to authenticated with check (true);
create policy "zones_update" on public.delivery_zones for update to authenticated using (true) with check (true);
create policy "zones_delete" on public.delivery_zones for delete to authenticated using (true);

-- ---- restaurant_settings ----
-- لا حذف للإعدادات (صف واحد دائم) — قراءة عامة + تعديل للمسجّلين فقط.
drop policy if exists "settings_read"   on public.restaurant_settings;
drop policy if exists "settings_update" on public.restaurant_settings;
create policy "settings_read"   on public.restaurant_settings for select using (true);
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
