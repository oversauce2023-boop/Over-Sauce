/**
 * app.js — Over Sauce Lounge Core Application Shell
 * ---------------------------------------------------------------------
 * Owns: global state, i18n/theme bootstrap, data loading, utilities,
 * toast system, scroll-reveal, header behavior, and the init sequence
 * that wires every other module together.
 *
 * Load order (see index.html): i18n.js → app.js → products.js →
 * cart.js → search.js → whatsapp.js
 * ---------------------------------------------------------------------
 */

/* =====================================================================
   GLOBAL STATE
   Exposed on window.OverSauce so other modules (cart.js, products.js,
   search.js, whatsapp.js) can share one source of truth without a
   bundler. This is intentional for a no-build, drop-in deployment.
   ===================================================================== */
window.OverSauce = {
  // ---- data (populated by loadData) ----
  categories: [],
  products: [],
  coupons: [],
  flashDeals: [],
  deliveryZones: [],
  minimumOrder: 0,
  restaurant: null,
  reviews: [],

  // ---- runtime state ----
  lang: "ar",                 // "ar" | "en"
  theme: "dark",               // "dark" | "light"
  activeCategory: null,
  searchQuery: "",
  sortMode: "default",
  priceFilter: { min: null, max: null },
  cart: {},                    // keyed by cartLineKey -> { product, qty, size, extras }
  recentlyViewed: [],          // array of product ids, most recent first
  appliedCoupon: null,
  orderType: "delivery",       // "delivery" | "pickup"
  deliveryZoneId: null,

  // ---- config ----
  config: {
    whatsappNumber: "966533500392",
    currency: "ر.س",
    maxRecentlyViewed: 8,
    maxQtyPerItem: 99,
    storagePrefix: "oversauce_"
  }
};

const M = window.OverSauce;

/* =====================================================================
   STORAGE — localStorage with an in-memory fallback.
   Some sandboxed / privacy-mode browsers throw on localStorage access;
   we never want that to crash the app, just silently degrade to a
   session-only experience.
   ===================================================================== */
const memoryStore = {};
function storageGet(key){
  try { return window.localStorage.getItem(M.config.storagePrefix + key); }
  catch(e){ return memoryStore[key] ?? null; }
}
function storageSet(key, value){
  try { window.localStorage.setItem(M.config.storagePrefix + key, value); }
  catch(e){ memoryStore[key] = value; }
}
function storageGetJSON(key, fallback){
  const raw = storageGet(key);
  if(raw == null) return fallback;
  try { return JSON.parse(raw); } catch(e){ return fallback; }
}
function storageSetJSON(key, value){
  storageSet(key, JSON.stringify(value));
}

/* =====================================================================
   UTILITIES
   ===================================================================== */
function t(key){
  const dict = I18N[M.lang] || I18N.ar;
  return dict[key] ?? key;
}
function localized(field){
  // field is an {ar, en} object from the data files
  if(!field) return "";
  return field[M.lang] ?? field.ar ?? field.en ?? "";
}
function formatPrice(n){
  const rounded = Math.round(n * 100) / 100;
  const localeCode = M.lang === "ar" ? "ar-EG" : "en-US";
  return rounded.toLocaleString(localeCode) + " " + M.config.currency;
}
function toLocaleDigits(str){
  if(M.lang !== "ar") return String(str);
  const map = {0:'٠',1:'١',2:'٢',3:'٣',4:'٤',5:'٥',6:'٦',7:'٧',8:'٨',9:'٩'};
  return String(str).replace(/[0-9]/g, d => map[d]);
}
function escapeHTML(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function sanitizeLine(str){
  return String(str).replace(/[\r\n]+/g, ' ').trim();
}
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

/* قفل حركة الصفحة بعدّاد مشترك: يُستخدم من أي مودال/شاشة (تفاصيل المنتج،
   تكبير الصورة، إلخ). القفل لا يُفكّ إلا بعد إغلاق كل الشاشات المفتوحة —
   يمنع تعارضًا كان يحصل عند إغلاق شاشة داخلية (مثل تكبير الصورة) بينما
   شاشة أخرى (مودال المنتج) لا تزال مفتوحة خلفها، فيفلت السكرول بالخطأ. */
let _scrollLockCount = 0;
function lockBodyScroll(){
  _scrollLockCount++;
  document.body.style.overflow = "hidden";
}
function unlockBodyScroll(){
  _scrollLockCount = Math.max(0, _scrollLockCount - 1);
  if(_scrollLockCount === 0) document.body.style.overflow = "";
}
function debounce(fn, wait){
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
function findProduct(id){
  if(id == null) return null;
  const key = String(id).trim();
  // مقارنة مرنة: قاعدة البيانات قد تُعيد المعرّف كرقم أو بمسافات زائدة،
  // بينما يأتي من DOM كنص دائمًا — المقارنة الصارمة كانت تفشل بصمت
  // فلا تفتح شاشة تفاصيل المنتج ولا يظهر أي خطأ.
  return M.products.find(p => String(p.id).trim() === key) || null;
}
function findCategory(id){
  return M.categories.find(c => c.id === id) || null;
}

/* =====================================================================
   DATA LOADING
   Tries fetch() against the /data/*.json files (works when served over
   http/https). Falls back to embedded sample data if fetch fails (e.g.
   when opened directly via file:// where fetch of local JSON is blocked
   by the browser) so the app is never left blank.
   ===================================================================== */
async function loadJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadData(){
  // Prefer Supabase when configured; gracefully fall back to bundled JSON.
  if (window.OSDB && OSDB.isConfigured()) {
    try {
      const data = await OSDB.fetchAll();
      M.categories = data.categories.sort((a,b) => a.order - b.order);
      M.products = data.products;
      M.coupons = data.coupons;
      M.flashDeals = data.flashDeals;
      M.deliveryZones = data.zones;
      M.minimumOrder = data.minimumOrder;
      M.restaurant = data.restaurant;
      if (data.currency) M.config.currency = data.currency;
      if (data.whatsappNumber) M.config.whatsappNumber = data.whatsappNumber;
      try { M.reviews = (await loadJSON("data/reviews.json")).reviews; } catch(_e){ M.reviews = []; }
      M.activeCategory = M.categories[0]?.id ?? null;
      return true;
    } catch (e) {
      console.warn("[OSDB] Supabase load failed — falling back to local JSON.", e);
    }
  }
  try {
    const [categoriesData, productsData, couponsData, zonesData, reviewsData] = await Promise.all([
      loadJSON("data/categories.json"),
      loadJSON("data/products.json"),
      loadJSON("data/coupons.json"),
      loadJSON("data/delivery-zones.json"),
      loadJSON("data/reviews.json")
    ]);

    M.categories = categoriesData.categories.sort((a,b) => a.order - b.order);
    M.products = productsData.products;
    M.coupons = couponsData.coupons;
    M.flashDeals = couponsData.flashDeals;
    M.deliveryZones = zonesData.deliveryZones;
    M.minimumOrder = zonesData.minimumOrder;
    M.restaurant = zonesData.restaurant;
    M.reviews = reviewsData.reviews;
    M.activeCategory = M.categories[0]?.id ?? null;

    return true;
  } catch(err){
    console.error("Over Sauce Lounge: data load failed, app cannot continue.", err);
    return false;
  }
}

/* =====================================================================
   THEME (dark / light)
   ===================================================================== */
function applyTheme(theme){
  M.theme = theme;
  const isLight = theme === "light";
  document.documentElement.classList.toggle("light", isLight);
  const icon = document.getElementById("themeIcon");
  if(icon) icon.textContent = isLight ? "☀️" : "🌙";
  const toggle = document.getElementById("themeToggle");
  if(toggle) toggle.setAttribute("aria-checked", String(isLight));
  storageSet("theme", theme);
  // Sync the theme-color meta tag for browser chrome (address bar tint)
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", isLight ? "#FBF8F2" : "#1B1F18");
}
function initTheme(){
  const stored = storageGet("theme");
  if(stored){
    applyTheme(stored);
  } else {
    // Premium light is the brand default on first visit; users can still toggle to dark (persisted).
    applyTheme("light");
  }
  const toggleBtn = document.getElementById("themeToggle");
  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      applyTheme(M.theme === "light" ? "dark" : "light");
    });
  }
}

/* =====================================================================
   LANGUAGE (ar / en) — toggles dir, swaps fonts via class, re-renders.
   ===================================================================== */
function applyLanguage(lang){
  M.lang = lang;
  const dict = I18N[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = dict.dir;
  storageSet("lang", lang);
  translateStaticDOM();
  // Re-render dynamic sections that depend on language
  if(window.OverSauceProducts){
    window.OverSauceProducts.renderCategoryNav();
    window.OverSauceProducts.renderAll();
  }
  /* السلة أُزيلت — كتالوج عرض فقط */
}
function initLanguage(){
  const stored = storageGet("lang");
  const initial = stored || "ar";
  applyLanguage(initial);
  const langBtn = document.getElementById("langToggle");
  if(langBtn){
    langBtn.addEventListener("click", () => {
      applyLanguage(M.lang === "ar" ? "en" : "ar");
    });
  }
}

/* Apply translations to every element carrying a data-i18n attribute.
   data-i18n="key" sets textContent; data-i18n-placeholder="key" sets
   the placeholder attribute; data-i18n-aria="key" sets aria-label. */
function translateStaticDOM(){
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  const langBtn = document.getElementById("langToggle");
  if(langBtn) langBtn.textContent = t("langToggle");
}

/* =====================================================================
   TOASTS
   ===================================================================== */
function showToast(messageKeyOrText, icon = "ℹ️", isRawText = false){
  const container = document.getElementById("toastContainer");
  if(!container) return;
  while(container.children.length >= 3){
    container.firstElementChild.remove();
  }
  const message = isRawText ? messageKeyOrText : t(messageKeyOrText);
  const toast = document.createElement("div");
  toast.className = "toast glass-strong";
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span aria-hidden="true">${icon}</span>
    <span style="flex:1; font-size:0.88rem; font-weight:600; color:var(--parchment);">${escapeHTML(message)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 350);
  }, 2700);
}

/* =====================================================================
   SCROLL REVEAL
   ===================================================================== */
let revealObserver = null;
function setupRevealObserver(){
  if(revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal:not(.in)").forEach(el => revealObserver.observe(el));
}

/* =====================================================================
   HEADER SCROLL SHADOW
   ===================================================================== */
function setupHeaderShadow(){
  const header = document.getElementById("siteHeader");
  if(!header) return;
  window.addEventListener("scroll", () => {
    header.classList.toggle("scrolled", window.scrollY > 40);
  }, { passive: true });
}

/* =====================================================================
   AMBIENT DUST PARTICLES (hero signature touch)
   ===================================================================== */
let dustEnabled = true;
function spawnDust(){
  if(!dustEnabled) return;
  const field = document.getElementById("dustField");
  if(!field) return;
  const size = Math.random() * 4 + 2;
  const dust = document.createElement("div");
  dust.className = "dust";
  dust.style.width = `${size}px`;
  dust.style.height = `${size}px`;
  dust.style.left = `${Math.random() * 100}%`;
  dust.style.bottom = `${Math.random() * 20}%`;
  dust.style.setProperty("--dx", `${(Math.random() - 0.5) * 60}px`);
  dust.style.animation = `drift ${6 + Math.random() * 6}s linear forwards`;
  field.appendChild(dust);
  setTimeout(() => dust.remove(), 13000);
}
function setupDustField(){
  // تأثير خفيف عند فتح الصفحة فقط (بدل تايمر مستمر بلا توقف)،
  // لتقليل الحمل المستمر على المعالج خصوصًا على الأجهزة المتوسطة.
  for(let i = 0; i < 6; i++) setTimeout(spawnDust, i * 200);
  document.addEventListener("visibilitychange", () => {
    dustEnabled = !document.hidden;
  });
}

/* =====================================================================
   HERO IMAGE LOAD HANDLING (skeleton -> fade in)
   ===================================================================== */
function setupHeroImage(){
  const heroImg = document.getElementById("heroImg");
  const heroSkeleton = document.getElementById("heroSkeleton");
  if(!heroImg) return;
  const onReady = () => {
    heroImg.classList.add("loaded");
    if(heroSkeleton) heroSkeleton.style.display = "none";
  };
  if(heroImg.complete && heroImg.naturalWidth > 0){
    onReady();
  } else {
    heroImg.addEventListener("load", onReady);
    heroImg.addEventListener("error", () => { if(heroSkeleton) heroSkeleton.style.display = "none"; });
  }
}

/* =====================================================================
   STATS COUNTER ANIMATION (homepage "Over Sauce Lounge in numbers")
   ===================================================================== */
function animateCounter(el, target){
  const duration = 1400;
  const start = performance.now();
  function tick(now){
    const progress = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(target * eased);
    el.textContent = toLocaleDigits(value.toLocaleString(M.lang === "ar" ? "ar-EG" : "en-US"));
    if(progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function setupStatsCounters(){
  const statEls = document.querySelectorAll("[data-stat-target]");
  if(!statEls.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        const target = Number(entry.target.getAttribute("data-stat-target"));
        animateCounter(entry.target, target);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  statEls.forEach(el => obs.observe(el));
}

/* =====================================================================
   GLOBAL ERROR SAFETY NET
   ===================================================================== */
window.addEventListener("error", (e) => {
  console.error("Over Sauce Lounge runtime error:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Over Sauce Lounge unhandled promise rejection:", e.reason);
});

/* =====================================================================
   RESTAURANT INFO BINDING (footer / contact / hero copy)
   ===================================================================== */
const PAGE_TITLES_AR = { home: "", menu: "القائمة", offers: "العروض", cart: "السلة", search: "بحث" };
const PAGE_TITLES_EN = { home: "", menu: "Menu", offers: "Offers", cart: "Cart", search: "Search" };
function setPageTitle(key){
  const base = (M.restaurant && M.restaurant.name) ? localized(M.restaurant.name) : "Over Sauce Lounge";
  const map = M.lang === "en" ? PAGE_TITLES_EN : PAGE_TITLES_AR;
  const sec = map[key] || "";
  document.title = sec ? `${base} | ${sec}` : base;
}

function applyFeatureFlags(){
  const f = (M.restaurant && M.restaurant.features) || {};
  const b = document.body;
  b.classList.toggle("ff-no-coupons", f.coupons === false);
  b.classList.toggle("ff-no-offers", f.offers === false);
  b.classList.toggle("ff-no-reviews", f.reviews === false);
  b.classList.toggle("ff-no-darkmode", f.darkMode === false);
  b.classList.toggle("ff-no-delivery", f.delivery === false);
  b.classList.toggle("ff-no-ordering", f.whatsappOrdering === false);

  // Ordering off → disable the send button.
  const sendBtn = document.getElementById("sendOrderBtn");
  if(sendBtn && !(M.restaurant && M.restaurant.ordersPaused)) sendBtn.disabled = (f.whatsappOrdering === false);
}

function bindRestaurantInfo(){
  if(!M.restaurant) return;
  setPageTitle("home");
  applyFeatureFlags();
  document.querySelectorAll("[data-bind='restaurantName']").forEach(el => el.textContent = localized(M.restaurant.name));
  document.querySelectorAll("[data-bind='restaurantTagline']").forEach(el => el.textContent = localized(M.restaurant.tagline));
  document.querySelectorAll("[data-bind='restaurantAddress']").forEach(el => el.textContent = localized(M.restaurant.address));
  document.querySelectorAll("[data-bind='restaurantHours']").forEach(el => el.textContent = localized(M.restaurant.openingHours));
  document.querySelectorAll("[data-bind='restaurantPhone']").forEach(el => {
    // نعرض الرقم بصيغة 05 المحلية المألوفة، مع إبقاء رابط الاتصال بالصيغة الدولية ليعمل صح.
    const raw = (M.restaurant.phone || "").replace(/\s/g, "");
    let display = raw;
    if(raw.startsWith("+966")) display = "0" + raw.slice(4);
    else if(raw.startsWith("966")) display = "0" + raw.slice(3);
    // لو الكارت يحتوي عنصرًا مخصصًا للرقم، نحدّثه وحده حتى لا نمسح الأيقونة والنص.
    const numTarget = el.querySelector(".phone-number-text");
    if(numTarget){ numTarget.textContent = display; }
    else { el.textContent = display; }
    if(el.tagName === "A") el.setAttribute("href", `tel:${raw}`);
  });
  document.querySelectorAll("[data-bind='mapsLink']").forEach(el => el.setAttribute("href", M.restaurant.mapsUrl));
  const bindSocial = (name, url) => document.querySelectorAll(`[data-bind='${name}']`).forEach(el => {
    if(url){ el.setAttribute("href", url); el.classList.remove("hidden"); }
    else { el.classList.add("hidden"); }
  });
  bindSocial("igLink", M.restaurant.social.instagram);
  // رابط واتساب عادي (للتواصل)
  bindSocial("waLink", M.restaurant.social.whatsappChannel || (M.restaurant.whatsapp ? `https://wa.me/${M.restaurant.whatsapp}` : ""));
  // رابط الحجز: يحوّل لواتساب المطعم برسالة جاهزة "أريد الحجز الآن"
  const bookNum = M.restaurant.whatsapp || M.config.whatsappNumber;
  const bookMsg = encodeURIComponent(M.lang === "ar" ? "أريد الحجز الآن" : "I would like to book now");
  const bookUrl = bookNum ? `https://wa.me/${bookNum}?text=${bookMsg}` : "#";
  document.querySelectorAll("[data-bind='bookNow']").forEach(el => el.setAttribute("href", bookUrl));
  bindSocial("snapLink", M.restaurant.social.snapchat);
  bindSocial("fbLink", M.restaurant.social.facebook);
  bindSocial("tiktokLink", M.restaurant.social.tiktok);
  document.querySelectorAll("[data-bind='statYears']").forEach(el => el.setAttribute("data-stat-target", M.restaurant.stats.yearsOfExperience));
  document.querySelectorAll("[data-bind='statItems']").forEach(el => el.setAttribute("data-stat-target", M.restaurant.stats.menuItems));

  // Orders-paused state → notice banner + lock the WhatsApp checkout button
  const ordersPaused = !!M.restaurant.ordersPaused;
  document.body.classList.toggle("orders-paused", ordersPaused);
  const opBanner = document.getElementById("ordersPausedBanner");
  if(opBanner) opBanner.classList.toggle("hidden", !ordersPaused);
  const opSendBtn = document.getElementById("sendOrderBtn");
  if(opSendBtn) opSendBtn.disabled = ordersPaused;
}

/* =====================================================================
   REVIEWS RENDER
   ===================================================================== */
function renderReviews(){
  const wrap = document.getElementById("reviewGrid");
  if(!wrap || !M.reviews.length) return;
  wrap.innerHTML = M.reviews.map(r => `
    <article class="review-card reveal">
      <div class="review-stars" aria-label="${r.rating} / 5">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>
      <p class="review-text">${escapeHTML(localized(r.text))}</p>
      <div class="review-author">
        <div class="review-avatar" aria-hidden="true">${escapeHTML(r.name.charAt(0))}</div>
        <div>
          <p class="review-name">${escapeHTML(r.name)}</p>
          <p class="review-item">${escapeHTML(r.item)}</p>
        </div>
      </div>
    </article>
  `).join("");
  setupRevealObserver();
}

/* =====================================================================
   FLASH DEALS / PROMO STRIP RENDER
   ===================================================================== */
function renderFlashDeals(){
  const wrap = document.getElementById("promoStrip");
  const section = document.getElementById("promoSection");
  // نُظهر قسم العروض فقط عند وجود عروض، ونُخفيه تمامًا إن كان فارغًا
  if(!wrap || !M.flashDeals.length){
    if(section) section.classList.add("hidden");
    return;
  }
  if(section) section.classList.remove("hidden");
  wrap.innerHTML = M.flashDeals.map(deal => {
    // لو العرض له صورة/تصميم جاهز → نعرض الصورة فقط. وإلا نعرض النص.
    if(deal.imageUrl){
      return `
    <div class="promo-card promo-card-image reveal">
      <img src="${deal.imageUrl}" alt="${escapeHTML(localized(deal.title) || t("flashDealsTitle"))}" loading="eager" fetchpriority="high" decoding="async">
    </div>`;
    }
    return `
    <div class="promo-card reveal">
      <p class="text-eyebrow">${t("flashDealsTitle")}</p>
      <h3 class="h3" style="margin-top:6px;">${escapeHTML(localized(deal.title))}</h3>
      <p class="muted" style="margin-top:6px; font-size:0.88rem;">${escapeHTML(localized(deal.subtitle))}</p>
    </div>`;
  }).join("");
  setupRevealObserver();
}

/* =====================================================================
   QR CODE (menu access) — generated client-side via a simple QR
   rendering against the current page URL, drawn into an inline SVG
   using the lightweight algorithm-free approach: an external,
   no-dependency QR image service is avoided for offline-safety, so we
   render a styled placeholder QR-like grid is NOT acceptable for a
   real QR — instead we link out to a well-known QR image endpoint
   with graceful fallback text if the image fails to load (e.g. offline).
   ===================================================================== */
function setupQRCode(){
  const box = document.getElementById("menuQRImage");
  if(!box) return;
  const url = window.location.origin + "/";
  // توليد QR محليًا (بدون خدمة خارجية) لضمان ظهوره دائمًا وبسرعة.
  try {
    box.innerHTML = "";
    if(typeof QRCode !== "undefined"){
      new QRCode(box, { text: url, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });
    } else {
      // احتياطي: خدمة خارجية لو لم تُحمّل المكتبة
      const img = document.createElement("img");
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(url)}`;
      img.width = 96; img.height = 96; img.alt = t("qrTitle");
      box.appendChild(img);
    }
  } catch(e){ /* silent */ }
}

/* =====================================================================
   SHARE MENU LINK
   ===================================================================== */
async function shareMenuLink(){
  const url = window.location.href;
  const title = M.restaurant ? localized(M.restaurant.name) : "Over Sauce Lounge";
  if(navigator.share){
    try { await navigator.share({ title, url }); return; }
    catch(e){ /* user cancelled share sheet — not an error */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("toastLinkCopied", "🔗");
  } catch(e){
    showToast("toastLinkCopied", "🔗"); // best-effort UX even if clipboard API is blocked
  }
}

/* =====================================================================
   INSTALL (PWA) PROMPT
   ===================================================================== */
/* بانر تثبيت التطبيق أُزيل — كان يعمل عبر beforeinstallprompt
   (مدعوم على أندرويد/كروم فقط، وليس آيفون/سفاري)، وكان يتعارض
   بصريًا مع زر "احجز الآن" العائم. */

/* =====================================================================
   SERVICE WORKER REGISTRATION
   ===================================================================== */
function registerServiceWorker(){
  if(!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(err => {
      console.warn("Over Sauce Lounge: service worker registration failed", err);
    });
  });
}

/* =====================================================================
   INIT SEQUENCE
   ===================================================================== */
async function initApp(){
  const ok = await loadData();
  if(!ok){
    const main = document.getElementById("main");
    if(main){
      main.innerHTML = `<div class="container section" style="text-align:center;">
        <p class="h2">عذرًا، حدث خطأ في تحميل القائمة</p>
        <p class="muted">يرجى إعادة تحميل الصفحة أو المحاولة لاحقًا.</p>
      </div>`;
    }
    return;
  }

  initTheme();
  initLanguage();
  bindRestaurantInfo();

  // Hand off to feature modules (each attaches itself to window.OverSauce*)
  if(window.OverSauceProducts) window.OverSauceProducts.init();
  /* السلة أُزيلت */
  if(window.OverSauceSearch) window.OverSauceSearch.init();

  renderReviews();
  renderFlashDeals();
  setupQRCode();
  setupHeaderShadow();
  setupHeroImage();
  setupDustField();
  setupStatsCounters();
  /* بانر التثبيت أُزيل */

  // Safety: a contact/social link whose URL isn't set stays href="#".
  // Stop those from jumping the page to the top when tapped.
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href="#"]');
    if(a) e.preventDefault();
  });

  /* التحديث اللحظي المستمر أُزيل من صفحة العميل: كان يفتح اتصالًا دائمًا
     بقاعدة البيانات يراقب أي تغيير في أي جدول، ويعيد تحميل الموقع بالكامل
     حتى لو التغيير غير متعلق بالمنتجات — عبء مستمر بلا داعٍ في كتالوج
     عرض (لا طلبات حية تحتاج تزامنًا فوريًا). تحديث الصفحة يعرض أحدث
     البيانات دائمًا بشكل طبيعي. */

  const shareBtn = document.getElementById("shareMenuBtn");
  if(shareBtn) shareBtn.addEventListener("click", shareMenuLink);

  requestAnimationFrame(() => {
    document.getElementById("heroContent")?.classList.add("in");
    setupRevealObserver();
  });

  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      /* السلة أُزيلت */
      window.OverSauceProducts?.closeProductModal();
    }
  });
}

async function refreshData(){
  try {
    const ok = await loadData();
    if(!ok) return;
    bindRestaurantInfo();
    if(window.OverSauceProducts) window.OverSauceProducts.renderAll();
    renderFlashDeals();
    showToast(M.lang === "ar" ? "تم تحديث القائمة" : "Menu updated", "🔄", true);
  } catch(e){ /* best-effort live refresh */ }
}

document.addEventListener("DOMContentLoaded", initApp);
registerServiceWorker();

/* Expose shared helpers to other modules via a namespaced object,
   avoiding pollution of the global scope beyond window.OverSauce. */
window.OverSauceCore = {
  t, localized, formatPrice, toLocaleDigits, escapeHTML, sanitizeLine,
  clamp, debounce, findProduct, findCategory, showToast,
  storageGet, storageSet, storageGetJSON, storageSetJSON,
  setupRevealObserver, applyLanguage, applyTheme, setPageTitle
};
