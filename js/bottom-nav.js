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
      if (!el) return;
      var header = document.getElementById("siteHeader");
      var offset = (header ? header.offsetHeight : 0) + 12;
      var y = el.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
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

      switch (action) {
        case "home":
          if(window.OverSauceCore) OverSauceCore.setPageTitle("home"); setActive(btn); toTop();
          break;
        case "menu":
          if(window.OverSauceCore) OverSauceCore.setPageTitle("menu"); setActive(btn); toEl("menu");
          break;
        case "offers":
          if(window.OverSauceCore) OverSauceCore.setPageTitle("offers"); setActive(btn); toEl("promoStrip");
          break;
      }
    });
  });
})();
