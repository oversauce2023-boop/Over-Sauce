/* =====================================================================
   config.js — Supabase connection settings
   ---------------------------------------------------------------------
   ضع هنا قيمتَي مشروعك من:
     Supabase Dashboard → Project Settings → API Keys
       • SUPABASE_URL              ← "Project URL"   (https://xxxx.supabase.co)
       • SUPABASE_PUBLISHABLE_KEY  ← "publishable key" (sb_publishable_...)

   ✅ الـ publishable key آمن في الواجهة بحكم التصميم.
   ❌ لا تضع الـ secret key (sb_secret_...) هنا إطلاقًا.

   ملاحظة: طالما القيم لسه placeholder (تبدأ بـ PASTE_)، الموقع يشتغل عادي
   من ملفات data/*.json المحلية. أول ما تحط قيمك الحقيقية، يقرأ من Supabase.
   ===================================================================== */
window.OS_CONFIG = {
  SUPABASE_URL: "https://mzdgfifsfipscicdszwu.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mFCAc84bVpeZk62ZsA8EuQ_fYI3H30G"
};
