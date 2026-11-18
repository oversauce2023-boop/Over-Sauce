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
  SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16ZGdmaWZzZmlwc2NpY2Rzend1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODQ2MTUsImV4cCI6MjA5ODE2MDYxNX0.p3aQWDUBFYruVRUXhSyGVKQccjpUfoEImvyJr71MrpQ"
};
