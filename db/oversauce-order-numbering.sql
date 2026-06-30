-- =====================================================================
-- Over Sauce — ترقيم الطلبات المتسلسل من ١
-- ---------------------------------------------------------------------
-- يجعل رقم الطلب رقمًا صافيًا متسلسلاً يبدأ من 1 (1، 2، 3...) بدل OS-1000.
-- شغّله مرة واحدة في SQL Editor. آمن لإعادة التشغيل.
-- نفّذه قبل استقبال طلبات حقيقية لأنه يصفّر العدّاد.
-- =====================================================================

alter sequence public.order_number_seq restart with 1;
alter sequence public.invoice_number_seq restart with 1;

alter table public.orders
  alter column order_number set default nextval('public.order_number_seq')::text;

alter table public.orders
  alter column invoice_number set default nextval('public.invoice_number_seq')::text;
