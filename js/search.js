/**
 * search.js — Over Sauce Lounge Instant Search
 * ---------------------------------------------------------------------
 * Thin wiring layer: debounces the header search input and triggers
 * a re-render of the menu via products.js. Kept as its own file so
 * search behavior (debounce timing, clear button, empty-state hook)
 * can evolve independently of the catalog rendering logic.
 * ---------------------------------------------------------------------
 */
(function(){
  const M = window.OverSauce;
  const { debounce } = window.OverSauceCore;

  function clearSearch(){
    M.searchQuery = "";
    const input = document.getElementById("searchInput");
    if(input) input.value = "";
    toggleBrowseSections(false);   // تعود الأقسام الترويجية لحالتها الأصلية
    window.OverSauceProducts?.renderMenu();
    input?.focus({ preventScroll: true });
  }

  /* الأقسام الترويجية أعلى الصفحة تُخفى أثناء البحث حتى تكون النتيجة هي
     كل ما يراه العميل، وتعود فور مسح البحث. */
  const PROMO_SECTIONS = [
    "promoSection", "bestSellersSection", "mostOrderedSection",
    "featuredSection", "recentlyViewedSection", "storySection", "statsSection"
  ];
  const promoVisibility = {};

  function toggleBrowseSections(searching){
    PROMO_SECTIONS.forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      if(searching){
        // نحفظ حالتها الأصلية مرة واحدة حتى لا نُظهر قسمًا كان مخفيًا أصلًا
        if(promoVisibility[id] === undefined){
          promoVisibility[id] = el.classList.contains("hidden");
        }
        el.classList.add("hidden");
      } else if(promoVisibility[id] !== undefined){
        el.classList.toggle("hidden", promoVisibility[id]);
      }
    });
  }

  /* عند بدء البحث ننتقل لموضع النتائج: قسم القائمة يقع أسفل الصفحة، فكان
     العميل يكتب في مربع البحث ولا يرى أي تغيير لأن النتائج خارج شاشته. */
  function revealResults(){
    const menu = document.getElementById("menu");
    if(!menu) return;
    const header = document.getElementById("siteHeader");
    const offset = (header ? header.offsetHeight : 120) + 12;
    const y = menu.getBoundingClientRect().top + window.scrollY - offset;
    try {
      if(typeof window.scrollTo === "function"){
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
    } catch(err){ /* تجاهل بأمان */ }
  }

  function init(){
    const input = document.getElementById("searchInput");
    if(input){
      let wasSearching = false;
      const onSearch = debounce((value) => {
        const query = String(value || "").trim();
        const searching = query.length > 0;
        M.searchQuery = value;
        toggleBrowseSections(searching);
        window.OverSauceProducts?.renderMenu();
        // ننتقل للنتائج مرة واحدة عند بدء البحث فقط — لا مع كل حرف،
        // حتى لا نقاطع العميل وهو يتصفّح النتائج.
        if(searching && !wasSearching) revealResults();
        wasSearching = searching;
      }, 200);
      input.addEventListener("input", (e) => onSearch(e.target.value));
    }
    document.getElementById("clearSearchBtn")?.addEventListener("click", clearSearch);
  }

  window.OverSauceSearch = { init, clearSearch };
})();
