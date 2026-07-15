/**
 * enhancements.js — Additive premium UX. No dependencies, no logic changes.
 *   1) Promo banners  → autoplay carousel + pagination dots (uses existing cards)
 *   2) Product image  → tap to open a fullscreen lightbox with point-to-zoom
 * Both are purely presentational; they observe/augment existing DOM only.
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  /* =================================================================
     1) PROMO BANNERS — autoplay + dots
     ================================================================= */
  ready(function () {
    var strip = document.getElementById("promoStrip");
    if (!strip) return;

    var dotsWrap = null, cards = [], index = 0, timer = null, paused = false, io = null, scrolling = false;

    function updateDots() {
      if (!dotsWrap) return;
      Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
        d.classList.toggle("active", i === index);
      });
    }
    function go(i) {
      if (!cards.length || scrolling) return;
      index = (i + cards.length) % cards.length;
      // Scroll ONLY the strip horizontally (never the page) using a visual delta.
      var card = cards[index];
      var sRect = strip.getBoundingClientRect();
      var cRect = card.getBoundingClientRect();
      var delta = (cRect.left + cRect.width / 2) - (sRect.left + sRect.width / 2);
      scrolling = true;
      strip.scrollBy({ left: delta, behavior: "smooth" });
      // نمنع أي استدعاء جديد لحد ما الحركة الحالية تخلص فعليًا — هذا القفل
      // هو ما كان ناقصًا ويمنع تعارض الحركة المبرمجة مع الالتصاق الأصلي.
      clearTimeout(go._lock);
      go._lock = setTimeout(function () { scrolling = false; }, 500);
      updateDots();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      stop();
      timer = setInterval(function () {
        if (!paused && !scrolling && document.visibilityState === "visible") go(index + 1);
      }, 4500);
    }
    function restart() { paused = false; start(); }

    function build() {
      cards = Array.prototype.slice.call(strip.querySelectorAll(".promo-card"));
      if (dotsWrap) { dotsWrap.remove(); dotsWrap = null; }
      if (io) { io.disconnect(); io = null; }
      stop();
      if (cards.length < 2) return; // single banner: nothing to rotate

      dotsWrap = document.createElement("div");
      dotsWrap.className = "promo-dots";
      cards.forEach(function (c, i) {
        var d = document.createElement("button");
        d.type = "button";
        d.className = "promo-dot" + (i === 0 ? " active" : "");
        d.setAttribute("aria-label", "عرض " + (i + 1));
        d.addEventListener("click", function () { go(i); restart(); });
        dotsWrap.appendChild(d);
      });
      strip.parentNode.insertBefore(dotsWrap, strip.nextSibling);

      // Keep the active dot in sync when the user scrolls manually.
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            index = cards.indexOf(e.target);
            updateDots();
          }
        });
      }, { root: strip, threshold: 0.6 });
      cards.forEach(function (c) { io.observe(c); });

      ["pointerdown", "touchstart", "mouseenter", "focusin"].forEach(function (ev) {
        strip.addEventListener(ev, function () { paused = true; }, { passive: true });
      });
      ["mouseleave", "touchend", "focusout"].forEach(function (ev) {
        strip.addEventListener(ev, function () { paused = false; }, { passive: true });
      });

      start();
    }

    // Cards are injected asynchronously after data loads — build once they exist.
    var mo = new MutationObserver(function () {
      if (strip.querySelector(".promo-card")) { build(); mo.disconnect(); }
    });
    mo.observe(strip, { childList: true });
    if (strip.querySelector(".promo-card")) { build(); mo.disconnect(); }
  });

  /* =================================================================
     2) تكبير صورة المنتج داخل شاشة التفاصيل — بقفل سكرول موحّد
     يمنع أي تضارب مع شاشة التفاصيل نفسها عند الإغلاق.
     ================================================================= */
  ready(function () {
    var box = null, imgEl = null;

    function ensure() {
      if (box) return;
      box = document.createElement("div");
      box.className = "img-lightbox";
      box.innerHTML = '<button class="img-lightbox-close" type="button" aria-label="إغلاق">&times;</button><img alt="">';
      imgEl = box.querySelector("img");
      document.body.appendChild(box);

      function close() {
        box.classList.remove("open");
        if (window.unlockBodyScroll) window.unlockBodyScroll();
      }
      box.addEventListener("click", function (e) {
        if (e.target === box || e.target.classList.contains("img-lightbox-close")) close();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && box.classList.contains("open")) close();
      });
    }

    document.addEventListener("click", function (e) {
      var t = e.target.closest("#productModalImg");
      if (!t) return;
      var src = t.getAttribute("src") || t.src;
      if (!src) return;
      ensure();
      imgEl.src = src;
      imgEl.alt = t.getAttribute("alt") || "";
      box.classList.add("open");
      if (window.lockBodyScroll) window.lockBodyScroll();
    });
  });
})();
