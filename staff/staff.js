/* ============================================================
   Over Sauce Lounge — Staff POS logic (Waiter Panel)
   Reuses window.OSDB (Supabase): auth, menu, orders, realtime.
   ============================================================ */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ر.س";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2200); }
  function debounce(fn, w) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), w); }; }
  function fmtTime(iso) { if (!iso) return ""; const d = new Date(iso); return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }); }
  function fmtFull(iso) { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("ar-EG") + " " + fmtTime(iso); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  const VAT_RATE = 0.15;
  const PAY_LABELS = { cash: "نقدًا", mada: "مدى", applepay: "Apple Pay", stcpay: "STC Pay", card: "بطاقة" };
  const ST = { pending: { ar: "قيد الانتظار" }, preparing: { ar: "قيد التحضير" }, ready: { ar: "جاهز" }, served: { ar: "تم التقديم" }, completed: { ar: "مكتمل" }, cancelled: { ar: "ملغي" } };
  const NEXT_STATUS = { pending: "preparing", preparing: "ready", ready: "served", served: "completed" };

  let DATA = { categories: [], products: [] };
  let cart = [];
  let activeCat = "all";
  let search = "";
  let pay = "cash";
  let me = { email: "", name: "موظف", role: "موظف", perms: [] };
  let myOrders = [];
  let lastSaved = null;
  let currentView = "order";
  let sheetState = null;

  /* ---------------- auth ---------------- */
  async function doLogin() {
    const email = $("emailInput").value.trim(), pw = $("passwordInput").value;
    if (!email || !pw) { $("loginErr").textContent = "ادخل البريد وكلمة المرور"; return; }
    if (!(window.OSDB && OSDB.isConfigured())) { $("loginErr").textContent = "النظام غير متصل بقاعدة البيانات"; return; }
    $("loginBtn").disabled = true; $("loginErr").textContent = "";
    try { await OSDB.signIn(email, pw); await afterLogin(); }
    catch (e) { $("loginErr").textContent = "بيانات الدخول غير صحيحة"; $("loginBtn").disabled = false; }
  }

  async function resolveMe() {
    let email = "";
    try { const u = await OSDB.getUser(); email = (u && u.email) ? u.email : ""; } catch (e) {}
    me.email = email;
    me.name = email ? email.split("@")[0] : "موظف";
    me.role = "موظف"; me.perms = [];
    try {
      const [emps, roles] = await Promise.all([OSDB.fetchEmployees(), OSDB.fetchRoles()]);
      const emp = emps.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
      if (emp) {
        me.name = emp.name || me.name;
        me.active = emp.active !== false;
        const r = roles.find((x) => x.id === emp.roleId);
        if (r) { me.role = r.name; me.perms = r.permissions || []; }
        if (!me.active) me.perms = []; // suspended → no access
      } else { me.role = "مدير"; me.perms = ["orders"]; me.active = true; } // owner / unmanaged
    } catch (e) { me.perms = ["orders"]; } // DB RLS still guards writes
  }
  function canOrder() { return me.perms.indexOf("orders") >= 0 || me.role === "مدير"; }

  async function afterLogin() {
    await resolveMe();
    if (!canOrder()) {
      $("loginErr").textContent = "هذا الحساب غير مصرّح له بإنشاء الطلبات";
      try { await OSDB.signOut(); } catch (e) {}
      $("loginBtn").disabled = false; return;
    }
    $("whoName").textContent = me.name;
    $("whoRole").textContent = me.role;
    $("avatar").textContent = (me.name || "؟").trim().slice(0, 2);
    await loadMenu();
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    setView("order");
    if (OSDB.subscribeTable) {
      OSDB.subscribeTable("orders", debounce(() => { if (currentView === "orders" || currentView === "perf") loadMyOrders(); }, 1000));
    }
  }

  async function loadMenu() {
    try {
      const all = await OSDB.fetchAll();
      DATA.categories = all.categories || [];
      DATA.products = all.products || [];
      DATA.restaurant = all.restaurant || {};
    } catch (e) { toast("تعذّر تحميل القائمة"); DATA = { categories: [], products: [] }; }
    renderCats(); renderProducts();
  }

  /* ---------------- views ---------------- */
  function setView(v) {
    currentView = v;
    ["order", "orders", "perf", "success"].forEach((x) => $("view" + cap(x)).classList.add("hidden"));
    $("view" + cap(v)).classList.remove("hidden");
    document.querySelectorAll(".top-tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-view") === v));
    if (v === "orders") loadMyOrders();
    if (v === "perf") renderPerf();
  }

  /* ---------------- categories + products ---------------- */
  function renderCats() {
    const bar = $("catBar");
    const cats = [{ id: "all", name: { ar: "الكل" } }].concat(DATA.categories);
    bar.innerHTML = cats.map((c) => `<button class="cat-pill ${c.id === activeCat ? "active" : ""}" data-cat="${esc(c.id)}">${esc(c.name.ar || c.name)}</button>`).join("");
    bar.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { activeCat = b.getAttribute("data-cat"); renderCats(); renderProducts(); }));
  }
  function visibleProducts() {
    let list = DATA.products;
    if (activeCat !== "all") list = list.filter((p) => p.category === activeCat);
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => (p.name.ar + " " + p.name.en + " " + (p.id || "")).toLowerCase().indexOf(q) >= 0); }
    return list;
  }
  function renderProducts() {
    const g = $("prodGrid"); const list = visibleProducts();
    if (!list.length) { g.innerHTML = `<div class="sec-label">لا توجد أصناف مطابقة</div>`; return; }
    g.innerHTML = list.map((p) => `
      <button class="prod-card ${p.inStock === false ? "out" : ""}" data-prod="${esc(p.id)}" ${p.inStock === false ? "disabled" : ""}>
        <img class="pimg" src="${esc(p.image || "")}" alt="${esc(p.name.ar || "")}" loading="lazy">
        <div class="pbody"><div class="pname">${esc(p.name.ar || "")}</div><div class="pprice">${money(p.price)}</div></div>
      </button>`).join("");
    g.querySelectorAll("[data-prod]").forEach((b) => b.addEventListener("click", () => onProductTap(b.getAttribute("data-prod"))));
  }
  function findProduct(id) { return DATA.products.find((p) => p.id === id); }

  function onProductTap(id) {
    const p = findProduct(id); if (!p) return;
    const hasOpts = (p.sizes && p.sizes.length) || (p.extras && p.extras.length);
    if (hasOpts) openSheet(p);
    else { addToCart(p, null, [], 1, ""); toast("أُضيف: " + (p.name.ar || "")); }
  }
  function unitPrice(p, sizeId, extraIds) {
    let base = Number(p.price) || 0;
    if (sizeId && p.sizes) { const s = p.sizes.find((x) => x.id === sizeId); if (s) base += Number(s.priceDiff) || 0; }
    (extraIds || []).forEach((eid) => { const ex = (p.extras || []).find((x) => x.id === eid); if (ex) base += Number(ex.price) || 0; });
    return base;
  }
  function addToCart(p, sizeId, extraIds, qty, notes) {
    const key = p.id + "|" + (sizeId || "") + "|" + (extraIds || []).slice().sort().join(",") + "|" + (notes || "");
    const ex = cart.find((c) => c.key === key);
    if (ex) ex.qty += qty;
    else cart.push({ key: key, product: p, qty: qty, size: sizeId || null, extras: extraIds || [], notes: notes || "", unitPrice: unitPrice(p, sizeId, extraIds) });
    renderCart();
  }

  /* ---------------- options sheet ---------------- */
  function openSheet(p) {
    sheetState = { p: p, size: (p.sizes && p.sizes[0]) ? p.sizes[0].id : null, extras: [], qty: 1, notes: "" };
    drawSheet();
    const s = $("optSheet"); s.classList.remove("hidden"); requestAnimationFrame(() => s.classList.add("show"));
  }
  function closeSheet() { const s = $("optSheet"); s.classList.remove("show"); setTimeout(() => s.classList.add("hidden"), 200); sheetState = null; }
  function drawSheet() {
    const p = sheetState.p, size = sheetState.size, extras = sheetState.extras, qty = sheetState.qty, notes = sheetState.notes;
    const sizesHtml = (p.sizes && p.sizes.length) ? `<div class="opt-group"><div class="gl">الحجم</div><div class="opt-pills">${p.sizes.map((s) => `<button class="opt-pill ${s.id === size ? "active" : ""}" data-size="${esc(s.id)}">${esc(s.name.ar || "")}${s.priceDiff ? ` (${s.priceDiff > 0 ? "+" : ""}${money(s.priceDiff)})` : ""}</button>`).join("")}</div></div>` : "";
    const extrasHtml = (p.extras && p.extras.length) ? `<div class="opt-group"><div class="gl">إضافات</div><div class="opt-pills">${p.extras.map((e) => `<button class="opt-pill ${extras.indexOf(e.id) >= 0 ? "active" : ""}" data-extra="${esc(e.id)}">${esc(e.name.ar || "")} (+${money(e.price)})</button>`).join("")}</div></div>` : "";
    $("optSheetInner").innerHTML = `
      <h3>${esc(p.name.ar || "")}</h3>
      <div style="color:var(--pos-soft); font-size:.9rem;">${money(unitPrice(p, size, extras))} للوحدة</div>
      ${sizesHtml}${extrasHtml}
      <div class="opt-group"><div class="gl">الكمية</div>
        <div class="qty-big"><button class="qb" data-q="-1">−</button><span class="qn">${qty}</span><button class="qb" data-q="1">＋</button></div></div>
      <div class="opt-group"><div class="gl">ملاحظات</div><input id="sheetNotes" class="mini" placeholder="بدون بصل، حار..." value="${esc(notes)}"></div>
      <button class="pos-btn block lg" id="sheetAdd">إضافة للطلب · ${money(unitPrice(p, size, extras) * qty)}</button>`;
    $("optSheetInner").querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => { sheetState.size = b.getAttribute("data-size"); drawSheet(); }));
    $("optSheetInner").querySelectorAll("[data-extra]").forEach((b) => b.addEventListener("click", () => { const id = b.getAttribute("data-extra"); const i = sheetState.extras.indexOf(id); if (i >= 0) sheetState.extras.splice(i, 1); else sheetState.extras.push(id); drawSheet(); }));
    $("optSheetInner").querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { sheetState.qty = Math.max(1, sheetState.qty + parseInt(b.getAttribute("data-q"), 10)); drawSheet(); }));
    const sn = $("sheetNotes"); if (sn) sn.addEventListener("input", () => { sheetState.notes = sn.value; });
    $("sheetAdd").addEventListener("click", () => { addToCart(sheetState.p, sheetState.size, sheetState.extras, sheetState.qty, sheetState.notes); closeSheet(); toast("أُضيف للطلب"); });
  }

  /* ---------------- cart ---------------- */
  function cartTotals() {
    const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.qty, 0);
    const grand = subtotal; // KSA menu prices are VAT-inclusive
    const vat = Math.round((grand - grand / (1 + VAT_RATE)) * 100) / 100;
    return { subtotal: subtotal, vat: vat, grand: grand };
  }
  function sizeName(c) { if (!c.size || !c.product.sizes) return ""; const s = c.product.sizes.find((x) => x.id === c.size); return s ? (s.name.ar || "") : ""; }
  function extrasNames(c) { return (c.extras || []).map((id) => { const e = (c.product.extras || []).find((x) => x.id === id); return e ? (e.name.ar || "") : ""; }).filter(Boolean).join("، "); }

  function renderCart() {
    const wrap = $("cartItems");
    if (!cart.length) {
      wrap.innerHTML = `<div class="cart-empty">السلة فارغة<br><span style="font-size:.85rem;">اضغط على الأصناف لإضافتها</span></div>`;
    } else {
      wrap.innerHTML = cart.map((c, i) => {
        const meta = [sizeName(c), extrasNames(c), c.notes].filter(Boolean).join(" · ");
        return `<div class="cline"><div class="cinfo">
          <div class="cname">${esc(c.product.name.ar || "")}</div>
          ${meta ? `<div class="cmeta">${esc(meta)}</div>` : ""}
          <div class="qty"><button class="qty-btn" data-dec="${i}">−</button><span class="qty-num">${c.qty}</span><button class="qty-btn" data-inc="${i}">＋</button><button class="crem" data-rem="${i}" title="حذف">🗑️</button></div>
        </div><div class="cprice">${money(c.unitPrice * c.qty)}</div></div>`;
      }).join("");
      wrap.querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => { cart[+b.getAttribute("data-inc")].qty++; renderCart(); }));
      wrap.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => { const i = +b.getAttribute("data-dec"); cart[i].qty--; if (cart[i].qty <= 0) cart.splice(i, 1); renderCart(); }));
      wrap.querySelectorAll("[data-rem]").forEach((b) => b.addEventListener("click", () => { cart.splice(+b.getAttribute("data-rem"), 1); renderCart(); }));
    }
    const t = cartTotals();
    $("tSub").textContent = money(t.subtotal); $("tVat").textContent = money(t.vat); $("tGrand").textContent = money(t.grand);
    $("fabCount").textContent = cart.reduce((s, c) => s + c.qty, 0); $("fabTotal").textContent = money(t.grand);
    $("confirmBtn").disabled = cart.length === 0;
  }

  /* ---------------- confirm / save ---------------- */
  async function confirmOrder() {
    if (!cart.length) return;
    const t = cartTotals();
    const items = cart.map((c) => ({
      productId: c.product.id,
      name: { ar: c.product.name.ar, en: c.product.name.en },
      size: c.size ? { ar: sizeName(c), en: "" } : null,
      extras: (c.extras || []).map((id) => { const e = (c.product.extras || []).find((x) => x.id === id); return { ar: e ? (e.name.ar || "") : "", en: "" }; }),
      qty: c.qty, unitPrice: c.unitPrice, lineTotal: c.unitPrice * c.qty
    }));
    const order = {
      id: "ord_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      customerName: ($("custInput").value.trim() || "ضيف"),
      phone: $("custPhone").value.trim(), address: "", orderType: "dine_in",
      tableNumber: $("tableInput").value.trim(), device: navigator.userAgent,
      items: items, notes: $("orderNotes").value.trim(),
      couponCode: "", discount: 0, vat: t.vat, deliveryFee: 0,
      subtotal: t.subtotal, grandTotal: t.grand,
      paymentMethod: pay, source: "staff", status: "pending",
      assignedEmployee: me.name,
      timeline: [{ type: "created", to: "pending", by: me.name, at: new Date().toISOString() }]
    };
    const btn = $("confirmBtn"); btn.disabled = true; btn.textContent = "جارٍ الحفظ...";
    try {
      const saved = await OSDB.createOrder(order);
      lastSaved = saved;
      $("successOrderNo").textContent = "طلب " + (saved.orderNumber || "");
      $("successInvNo").textContent = "فاتورة " + (saved.invoiceNumber || "");
      resetOrder();
      setView("success");
      $("cartPanel").classList.remove("open");
    } catch (e) {
      toast("تعذّر حفظ الطلب — حاول مرة أخرى");
    } finally {
      btn.disabled = false; btn.textContent = "تأكيد الطلب · إرسال للمطبخ";
    }
  }
  function resetOrder() {
    cart = []; pay = "cash"; activeCat = "all"; search = "";
    $("custInput").value = ""; $("custPhone").value = ""; $("tableInput").value = ""; $("orderNotes").value = ""; $("prodSearch").value = "";
    document.querySelectorAll(".pay-pill").forEach((p) => p.classList.toggle("active", p.getAttribute("data-pay") === "cash"));
    renderCats(); renderProducts(); renderCart();
  }

  /* ---------------- my orders ---------------- */
  async function loadMyOrders() {
    try {
      const all = await OSDB.fetchOrders();
      const today = new Date().toISOString().slice(0, 10);
      myOrders = all.filter((o) => (o.assignedEmployee || "") === me.name && (o.createdAt || "").slice(0, 10) === today);
    } catch (e) { myOrders = []; }
    renderOrders();
  }
  function renderOrders() {
    const wrap = $("ordersList");
    if (!myOrders.length) { wrap.innerHTML = `<div class="cart-empty">لا توجد طلبات اليوم بعد.</div>`; return; }
    wrap.innerHTML = myOrders.map((o) => {
      const st = ST[o.status] || ST.pending;
      const next = NEXT_STATUS[o.status];
      const itemCount = (o.items || []).reduce((s, i) => s + i.qty, 0);
      return `<div class="ord-card">
        <div class="oh"><div><div class="onum">${esc(o.orderNumber || "")}${o.tableNumber ? ` · طاولة ${esc(o.tableNumber)}` : ""}</div>
        <div class="ometa">${itemCount} صنف · ${money(o.grandTotal)} · ${fmtTime(o.createdAt)}</div></div>
        <span class="st-badge st-${o.status}">${st.ar}</span></div>
        <div class="adv-row">
          ${next ? `<button class="pos-btn success" data-next="${esc(o.id)}" style="flex:1; min-height:48px;">التالي: ${ST[next].ar}</button>` : ""}
          <button class="pos-btn ghost" data-print="${esc(o.id)}" style="min-height:48px;">🖨️</button>
          ${(o.status !== "completed" && o.status !== "cancelled") ? `<button class="pos-btn danger" data-cancel="${esc(o.id)}" style="min-height:48px;">إلغاء</button>` : ""}
        </div></div>`;
    }).join("");
    wrap.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", () => advance(b.getAttribute("data-next"))));
    wrap.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => setStatus(b.getAttribute("data-cancel"), "cancelled")));
    wrap.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => { const o = myOrders.find((x) => x.id === b.getAttribute("data-print")); if (o) printInvoice(o); }));
  }
  function advance(id) { const o = myOrders.find((x) => x.id === id); if (!o) return; const next = NEXT_STATUS[o.status]; if (next) setStatus(id, next); }
  async function setStatus(id, status) {
    const o = myOrders.find((x) => x.id === id); if (!o) return;
    const ev = { type: "status", from: o.status, to: status, by: me.name, at: new Date().toISOString() };
    const tl = (o.timeline || []).concat([ev]);
    try { await OSDB.updateOrder(id, { status: status, timeline: tl }); o.status = status; o.timeline = tl; renderOrders(); toast("تم تحديث الحالة"); }
    catch (e) { toast("تعذّر تحديث الحالة"); }
  }

  /* ---------------- performance ---------------- */
  async function renderPerf() {
    await loadMyOrders();
    const active = myOrders.filter((o) => o.status !== "cancelled");
    const revenue = active.reduce((s, o) => s + Number(o.grandTotal || 0), 0);
    const avg = active.length ? revenue / active.length : 0;
    const done = myOrders.filter((o) => o.status === "completed").length;
    $("perfStats").innerHTML = `
      <div class="stat-box"><div class="sv">${myOrders.length}</div><div class="sl">طلبات اليوم</div></div>
      <div class="stat-box"><div class="sv">${money(revenue)}</div><div class="sl">إجمالي المبيعات</div></div>
      <div class="stat-box"><div class="sv">${money(avg)}</div><div class="sl">متوسط الطلب</div></div>
      <div class="stat-box"><div class="sv">${done}</div><div class="sl">طلبات مكتملة</div></div>`;
  }

  /* ---------------- print + whatsapp ---------------- */
  // ترميز ZATCA TLV ثم Base64 لرمز QR للفاتورة الضريبية المبسّطة.
  // الحقول الخمسة الإلزامية: اسم البائع، الرقم الضريبي، الطابع الزمني،
  // الإجمالي شامل الضريبة، مبلغ الضريبة.
  function zatcaTLV(sellerName, vatNumber, timestamp, total, vat) {
    function toUTF8(str){ return new TextEncoder().encode(str); }
    function tlv(tag, valueStr){
      const val = toUTF8(valueStr);
      return [tag, val.length, ...val];
    }
    const bytes = [
      ...tlv(1, sellerName),
      ...tlv(2, vatNumber),
      ...tlv(3, timestamp),
      ...tlv(4, String(total)),
      ...tlv(5, String(vat))
    ];
    let bin = "";
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  function printInvoice(o) {
    const rows = (o.items || []).map((it) => { const sz = it.size ? ` (${esc((it.size.ar) || "")})` : ""; return `<tr><td>${esc(((it.name && it.name.ar) || "")) + sz} × ${esc(it.qty)}</td><td style="text-align:left;">${money(it.lineTotal)}</td></tr>`; }).join("");

    // الرقم الضريبي اختياري: لو موجود نطبع فاتورة ضريبية كاملة برمز QR،
    // وإلا نطبع إيصالًا عاديًا دون رقم ضريبي أو QR.
    const vatNo = (DATA.restaurant && DATA.restaurant.vatNumber) || "";
    const sellerName = (DATA.restaurant && DATA.restaurant.name && DATA.restaurant.name.ar) || "Over Sauce Lounge";
    let vatBlock = "", qrBlock = "";
    if (vatNo) {
      vatBlock = `<div style="margin-top:4px;">الرقم الضريبي: <b>${esc(vatNo)}</b></div>`;
      try {
        const qrData = zatcaTLV(sellerName, vatNo, o.createdAt || new Date().toISOString(), o.grandTotal || 0, o.vat || 0);
        // نولّد رمز QR عبر مكتبة موثوقة من CDN داخل نافذة الطباعة نفسها.
        qrBlock = `<div id="zatcaQr" style="margin:14px auto 4px;text-align:center;"></div>
<scr`+`ipt src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></scr`+`ipt>
<scr`+`ipt>try{new QRCode(document.getElementById("zatcaQr"),{text:${JSON.stringify(qrData)},width:120,height:120});}catch(e){}</scr`+`ipt>`;
      } catch (e) { qrBlock = ""; }
    }

    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>فاتورة ${esc(o.invoiceNumber || o.orderNumber || "")}</title>
<style>body{font-family:Arial,sans-serif;padding:18px;color:#111;max-width:380px;}h1{font-size:18px;margin:0;}table{width:100%;border-collapse:collapse;margin-top:10px;}td{padding:5px;border-bottom:1px solid #ddd;text-align:right;}.tot td{font-weight:bold;font-size:15px;border-top:2px solid #333;}.muted{color:#666;font-size:12px;}</style>
</head><body>
<img src="/assets/brand/logo-192.png" alt="Over Sauce Lounge" style="height:70px;margin:0 auto 6px;display:block;"><h1 style="font-size:15px;">Over Sauce Lounge</h1><div class="muted">${vatNo ? "فاتورة ضريبية مبسطة" : "إيصال"}</div>
<div style="margin-top:8px;">فاتورة: <b>${esc(o.invoiceNumber || "")}</b> · طلب: ${esc(o.orderNumber || "")}</div>
${vatBlock}
<div>${o.tableNumber ? ("طاولة: " + esc(o.tableNumber) + " · ") : ""}الموظف: ${esc(o.assignedEmployee || "")}</div>
<div class="muted">${fmtFull(o.createdAt)}</div>
<table><tbody>${rows}</tbody></table>
<table style="margin-top:4px;">
<tr><td>الإجمالي الفرعي</td><td style="text-align:left;">${money(o.subtotal)}</td></tr>
<tr><td>ض.ق.م 15% (شامل)</td><td style="text-align:left;">${money(o.vat)}</td></tr>
<tr class="tot"><td>الإجمالي</td><td style="text-align:left;">${money(o.grandTotal)}</td></tr>
</table>
<div style="margin-top:6px;">الدفع: ${PAY_LABELS[o.paymentMethod] || esc(o.paymentMethod)}</div>
${qrBlock}
<div class="muted" style="margin-top:14px;text-align:center;">شكراً لزيارتكم</div>
<scr` + `ipt>window.onload=function(){setTimeout(function(){window.print();},${vatNo ? 350 : 0});}</scr` + `ipt>
</body></html>`;
    const w = window.open("", "_blank", "width=400,height=640");
    if (!w) { toast("اسمح بالنوافذ المنبثقة للطباعة"); return; }
    w.document.write(html); w.document.close();
  }
  function waSend(o) {
    const lines = ["*طلب — Over Sauce Lounge*", "🔖 " + (o.orderNumber || "")];
    if (o.tableNumber) lines.push("🪑 طاولة " + o.tableNumber);
    lines.push("━━━━━━━━━━");
    (o.items || []).forEach((it) => { lines.push("• " + ((it.name && it.name.ar) || "") + " × " + it.qty + " — " + money(it.lineTotal)); });
    lines.push("━━━━━━━━━━", "الإجمالي: " + money(o.grandTotal), "الدفع: " + (PAY_LABELS[o.paymentMethod] || o.paymentMethod));
    const text = encodeURIComponent(lines.join("\n"));
    const num = (o.phone || "").replace(/[^\d]/g, "");
    window.open(num ? ("https://wa.me/" + num + "?text=" + text) : ("https://wa.me/?text=" + text), "_blank");
  }

  /* ---------------- wire ---------------- */
  function wire() {
    $("loginBtn").addEventListener("click", doLogin);
    $("passwordInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
    $("logoutBtn").addEventListener("click", async () => { try { await OSDB.signOut(); } catch (e) {} location.reload(); });
    document.querySelectorAll(".top-tab").forEach((t) => t.addEventListener("click", () => setView(t.getAttribute("data-view"))));
    $("prodSearch").addEventListener("input", (e) => { search = e.target.value; renderProducts(); });
    $("scanBtn").addEventListener("click", () => toast("ماسح الباركود يُضاف في التحديث القادم"));
    document.querySelectorAll(".pay-pill").forEach((p) => p.addEventListener("click", () => { pay = p.getAttribute("data-pay"); document.querySelectorAll(".pay-pill").forEach((x) => x.classList.toggle("active", x === p)); }));
    $("confirmBtn").addEventListener("click", confirmOrder);
    $("newOrderBtn").addEventListener("click", () => setView("order"));
    $("printBtn").addEventListener("click", () => { if (lastSaved) printInvoice(lastSaved); });
    $("waBtn").addEventListener("click", () => { if (lastSaved) waSend(lastSaved); });
    $("ordersRefresh").addEventListener("click", loadMyOrders);
    $("cartFab").addEventListener("click", () => $("cartPanel").classList.add("open"));
    $("cartCloseBtn").addEventListener("click", () => $("cartPanel").classList.remove("open"));
    $("optSheet").addEventListener("click", (e) => { if (e.target.id === "optSheet") closeSheet(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetState) closeSheet(); });
    renderCart();
    // restore an existing session (already logged in)
    if (window.OSDB && OSDB.isConfigured()) {
      OSDB.getUser().then((u) => { if (u && u.email) afterLogin(); }).catch(() => {});
    }
  }
  document.addEventListener("DOMContentLoaded", wire);
})();
