-- =====================================================================
-- Over Sauce Lounge (أوفر صوص لاونج) — بيانات المطعم الحقيقية
-- ---------------------------------------------------------------------
-- شغّل هذا الملف مرة واحدة بعد supabase-setup.sql (وبعد seed إن أردت).
-- آمن للتشغيل سواء كنت شغّلت الملفات السابقة أو لا (idempotent):
--   • يضيف عمودَي سناب شات وفيسبوك إن لم يكونا موجودين.
--   • يحدّث صف الإعدادات ببيانات أوفر صوص الحقيقية + العملة (ريال سعودي).
-- =====================================================================

-- 1) أعمدة سوشيال إضافية يستخدمها هذا العميل (سناب شات + فيسبوك)
alter table public.restaurant_settings add column if not exists snapchat_url text not null default '';
alter table public.restaurant_settings add column if not exists facebook_url text not null default '';

-- 2) تأكيد وجود صف الإعدادات ثم تحديثه بالبيانات الحقيقية
insert into public.restaurant_settings (id) values (1) on conflict (id) do nothing;

update public.restaurant_settings set
  name_ar              = 'Over Sauce Lounge',   -- بالإنجليزي حتى في الواجهة العربية
  name_en              = 'Over Sauce Lounge',
  tagline_ar           = 'مطعم وكافيه • أجواء وجلسات مميزة في قلب جدة',
  tagline_en           = 'Restaurant & cafe — a distinctive lounge in the heart of Jeddah',
  phone                = '+966533500392',
  whatsapp_number      = '966533500392',          -- نفس الرقم (للطلبات عبر واتساب)
  address_ar           = 'حي الحمراء، جدة، السعودية',
  address_en           = 'Al Hamra District, Jeddah, Saudi Arabia',
  opening_hours_ar     = 'مفتوح ٢٤ ساعة يوميًا',
  opening_hours_en     = 'Open 24 hours, daily',
  maps_url             = 'https://maps.app.goo.gl/atzVhkm9tY8mXZ159',
  instagram_url        = 'https://www.instagram.com/oversauce1',
  snapchat_url         = 'https://snapchat.com/t/Mj0oXzyV',
  facebook_url         = 'https://www.facebook.com/share/1CrxvWv1h1/',
  tiktok_url           = '',                       -- لا يوجد تيك توك مؤكد بعد
  whatsapp_channel_url = '',
  average_rating       = 4.5,                       -- التقييم الفعلي على Google
  currency             = 'ر.س'
where id = 1;

-- =====================================================================
-- ملاحظات:
--  • years_experience / happy_customers / menu_items_count ما زالت بقيم
--    الديمو — عدّلها من لوحة الأدمن (أو هنا) بأرقام المطعم الحقيقية.
--  • قائمة الأطباق (50 طبق) ما زالت بيانات تجريبية حتى تصلنا قائمة المطعم.
-- =====================================================================
