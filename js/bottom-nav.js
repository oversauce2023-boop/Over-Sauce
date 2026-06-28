/**
 * bottom-nav.js — Mobile bottom navigation (standalone, no dependencies).
 * Wires each tab to EXISTING behaviour only; touches no business logic.
 *   home      → scroll to top
 *   menu      → scroll to #menu
 *   offers    → scroll to #promoStrip
 *   favorites → toggle a body class; a pure-CSS :has() filter hides
 *               non-favourited cards in the menu (no render changes)
 *   cart      → triggers the existing floating-cart open handler
 */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    var nav = document.getElementById("bottomNav");
    if (!nav) return;
    var items = nav.querySelectorAll(".bottom-nav-item");

    function setActive(btn) {
      items.forEach(function (i) { i.classList.toggle("active", i === btn); });
    }
    function toTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }
    function toEl(id) {
      var el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function isArabic() { return document.documentElement.lang !== "en"; }

    var hintEl = null, hintTimer = null;
    function hint(msg) {
      if (!hintEl) {
        hintEl = document.createElement("div");
        hintEl.className = "bottom-nav-hint";
        document.body.appendChild(hintEl);
      }
      hintEl.textContent = msg;
      // force reflow so the transition replays
      void hintEl.offsetWidth;
      hintEl.classList.add("show");
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { hintEl.classList.remove("show"); }, 2200);
    }

    nav.addEventListener("click", function (e) {
      var btn = e.target.closest(".bottom-nav-item");
      if (!btn) return;
      var action = btn.getAttribute("data-nav");

      // Any tab other than favourites clears the favourites filter.
      if (action !== "favorites") document.body.classList.remove("show-favs-only");

      switch (action) {
        case "home":
          setActive(btn); toTop();
          break;
        case "menu":
          setActive(btn); toEl("menu");
          break;
        case "offers":
          setActive(btn); toEl("promoStrip");
          break;
        case "favorites": {
          var favCount = document.querySelectorAll(".fav-btn.active").length;
          if (favCount === 0 && !document.body.classList.contains("show-favs-only")) {
            hint(isArabic() ? "أضِف أطباقًا للمفضلة أولاً ♥" : "Add items to favourites first ♥");
            return;
          }
          var on = document.body.classList.toggle("show-favs-only");
          setActive(on ? btn : items[0]);
          if (on) toEl("menu");
          break;
        }
        case "cart": {
          // Reuse the existing floating-cart open handler (works even when hidden).
          var fab = document.getElementById("fabCart");
          if (fab) fab.click();
          break;
        }
      }
    });
  });
})();
