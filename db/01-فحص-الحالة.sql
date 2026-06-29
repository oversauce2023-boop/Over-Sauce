-- =====================================================================
-- Over Sauce — فحص الحالة (آمن مع الجداول الناقصة، قراءة فقط)
-- ---------------------------------------------------------------------
-- لا يذكر أي جدول من جداولك بالاسم مباشرة، بل يسأل فهرس النظام
-- (information_schema / pg_catalog) الموجود دائمًا — فلا يفشل أبدًا.
-- الصقه كامل في SQL Editor واضغط Run.
-- =====================================================================
with
-- وجود كل جدول مطلوب
tbl(name) as (values
  ('categories'),('products'),('coupons'),('delivery_zones'),
  ('restaurant_settings'),('orders'),('roles'),('employees'),
  ('flash_deals'),('feature_flags')
),
existing as (
  select table_name from information_schema.tables where table_schema='public'
),
-- عدد الصفوف الحقيقي لكل جدول من إحصاءات النظام (تقريبي لكنه يكفي للفحص)
rowcounts as (
  select c.relname as tname, c.reltuples::bigint as approx_rows
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r'
)
-- (1) حالة وجود الجداول
select 1 as ord,
       'جدول: ' || t.name as "العنصر",
       case when e.table_name is not null then '✅ موجود' else '❌ ناقص' end as "الحالة"
from tbl t left join existing e on e.table_name=t.name

union all
-- (2) ملف staff: حقول الطاولة/الفاتورة في orders
select 2, 'ملف staff (طاولة/فاتورة)',
       case when (select count(*) from information_schema.columns
                  where table_schema='public' and table_name='orders'
                    and column_name in ('table_number','invoice_number')) >= 2
            then '✅ مُشغّل' else '❌ ناقص (أو جدول orders نفسه ناقص)' end

union all
-- (3) 🔴 الحماية الحقيقية: دالة has_permission
select 3, '🔴 الحماية (rls-roles)',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='has_permission'
       ) then '✅ مفعّلة' else '🔴 غير مفعّلة — بياناتك مكشوفة!' end

union all
-- (4) RLS مفعّل على الجداول الحسّاسة الموجودة فقط
select 4, 'RLS على: ' || c.relname,
       case when c.relrowsecurity then '✅ محمي' else '🔴 غير محمي' end
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('products','categories','orders','employees','roles','restaurant_settings')

union all
-- (5) عدد الصفوف التقريبي لكل جدول موجود
select 5, 'عدد الصفوف ~ ' || tname,
       greatest(approx_rows,0)::text
from rowcounts
where tname in ('categories','products','orders','employees')

order by 1, "العنصر";
