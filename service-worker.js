/**
 * service-worker.js — Over Sauce Lounge PWA Service Worker
 * ---------------------------------------------------------------------
 * Strategy:
 *   - App shell (HTML/CSS/JS) + data JSON: cache-first with background
 *     revalidation ("stale-while-revalidate") so the app opens instantly
 *     even offline, while still picking up menu/price updates quickly
 *     on the next successful fetch.
 *   - Remote images (Unsplash, QR codes): cache-first with a fallback
 *     to network, capped cache size so storage doesn't grow unbounded.
 *   - Navigation requests fall back to the cached shell when fully
 *     offline, so the app never shows the browser's offline dino page.
 * ---------------------------------------------------------------------
 */

const VERSION = "oversauce-v5.7.0-catalog";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const IMAGE_CACHE = `${VERSION}-images`;
const MAX_IMAGE_CACHE_ENTRIES = 80;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/main.css",
  "./css/animations.css",
  "./css/responsive.css",
  "./js/i18n.js",
  "./js/app.js",
  "./js/products.js",
  "./js/search.js",
  "./js/config.js",
  "./js/supabase.js",
  "./js/bottom-nav.js",
  "./js/enhancements.js",
  "./data/categories.json",
  "./data/products.json",
  "./data/coupons.json",
  "./data/delivery-zones.json",
  "./data/reviews.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

/* =====================================================================
   INSTALL — pre-cache the app shell so the very first offline load
   already has everything it needs.
   ===================================================================== */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // نخزّن كل ملف على حدة: فشل ملف واحد (محذوف/غير متاح) لا يُفشل
      // التثبيت بالكامل — كان هذا يمنع عمل الـ service worker كليًا.
      .then((cache) => Promise.all(
        SHELL_ASSETS.map((asset) =>
          cache.add(asset).catch(() => null)
        )
      ))
      .then(() => self.skipWaiting())
  );
});

/* =====================================================================
   ACTIVATE — clean up old versioned caches on deploy.
   ===================================================================== */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("oversauce-") && !key.startsWith(VERSION))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* =====================================================================
   HELPERS
   ===================================================================== */
async function trimCache(cacheName, maxEntries){
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if(keys.length > maxEntries){
    await cache.delete(keys[0]); // FIFO eviction of the oldest entry
  }
}

async function staleWhileRevalidate(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if(response && response.ok){
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
}

async function cacheFirstThenNetwork(request, cacheName, maxEntries){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if(cached) return cached;
  try {
    const response = await fetch(request);
    if(response && response.ok){
      await cache.put(request, response.clone());
      if(maxEntries) await trimCache(cacheName, maxEntries);
    }
    return response;
  } catch(err){
    // لو فشل الجلب (حجب CSP، انقطاع شبكة...) نمرّر الطلب للمتصفح ليتولّاه
    // بشكل طبيعي بدل إرجاع خطأ يتكرر ويُبطئ الصفحة.
    return cached || fetch(request).catch(() => Response.error());
  }
}

/* =====================================================================
   FETCH ROUTING
   ===================================================================== */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if(request.method !== "GET") return; // never cache mutating requests

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 1. Navigations (the HTML document itself) — shell cache, offline fallback
  if(request.mode === "navigate"){
    event.respondWith(
      staleWhileRevalidate(request, SHELL_CACHE).catch(() =>
        caches.match("./index.html")
      )
    );
    return;
  }

  if(isSameOrigin){
    // 2. Local data JSON — stale-while-revalidate so menu updates propagate
    if(url.pathname.includes("/data/")){
      event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
      return;
    }
    // 3. Local CSS/JS/icons — shell cache, stale-while-revalidate
    if(/\.(css|js|png|svg|ico)$/.test(url.pathname)){
      event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
      return;
    }
  } else {
    // 4. Remote images (Unsplash food photography, QR codes) — cache-first, capped
    if(request.destination === "image"){
      event.respondWith(cacheFirstThenNetwork(request, IMAGE_CACHE, MAX_IMAGE_CACHE_ENTRIES));
      return;
    }
    // 5. خطوط جوجل: لا نعترضها إطلاقًا — المتصفح يخزّنها بكفاءة بنفسه،
    //    واعتراضها هنا كان يسبب فشل جلب متكرر (تعارض مع سياسة CSP)
    //    يُبطئ الصفحة ويُغرق الـ console بالأخطاء.
  }

  // 6. Everything else — just go to the network (e.g. wa.me order links)
});
