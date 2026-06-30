-- =====================================================================
-- Over Sauce — تحديثات: صورة العروض + قسم الحلويات
-- ---------------------------------------------------------------------
-- شغّله مرة واحدة في SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

-- 1) عمود صورة العرض (اختياري) — يتيح رفع تصميم جاهز بدل النص
alter table public.flash_deals
  add column if not exists image_url text not null default '';

-- 2) إضافة قسم الحلويات للفئات
insert into public.categories (id, icon, name_ar, name_en, sort_order)
values ('desserts', '🍰', 'حلويات', 'Desserts',
  coalesce((select max(sort_order) from public.categories), 0) + 1)
on conflict (id) do nothing;
