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

    var dotsWrap = null, cards = [], index = 0, timer = null, paused = false, io = null;

    function updateDots() {
      if (!dotsWrap) return;
      Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
        d.classList.toggle("active", i === index);
      });
    }
    function go(i) {
      if (!cards.length) return;
      index = (i + cards.length) % cards.length;
      // Scroll ONLY the strip horizontally (never the page) using a visual delta.
      var card = cards[index];
      var sRect = strip.getBoundingClientRect();
      var cRect = card.getBoundingClientRect();
      var delta = (cRect.left + cRect.width / 2) - (sRect.left + sRect.width / 2);
      strip.scrollBy({ left: delta, behavior: "smooth" });
      updateDots();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      stop();
      timer = setInterval(function () {
        if (!paused && document.visibilityState === "visible") go(index + 1);
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
     2) PRODUCT IMAGE — tap-to-zoom lightbox
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
        imgEl.classList.remove("zoomed");
        imgEl.style.transformOrigin = "center";
        document.body.style.overflow = "";
      }
      box.addEventListener("click", function (e) {
        if (e.target === box || e.target.classList.contains("img-lightbox-close")) close();
      });
      imgEl.addEventListener("click", function (e) {
        e.stopPropagation();
        var z = imgEl.classList.toggle("zoomed");
        if (z) {
          var r = imgEl.getBoundingClientRect();
          var ox = ((e.clientX - r.left) / r.width) * 100;
          var oy = ((e.clientY - r.top) / r.height) * 100;
          imgEl.style.transformOrigin = ox + "% " + oy + "%";
        } else {
          imgEl.style.transformOrigin = "center";
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && box.classList.contains("open")) close();
      });
    }

    function open(src, alt) {
      ensure();
      imgEl.src = src;
      imgEl.alt = alt || "";
      imgEl.classList.remove("zoomed");
      imgEl.style.transformOrigin = "center";
      box.classList.add("open");
      document.body.style.overflow = "hidden";
    }

    document.addEventListener("click", function (e) {
      var t = e.target.closest("#productModalImg");
      if (!t) return;
      var src = t.getAttribute("src") || t.src;
      if (src) open(src, t.getAttribute("alt"));
    });
  });
})();
