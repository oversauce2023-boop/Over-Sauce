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
    window.OverSauceProducts?.renderMenu();
    input?.focus();
  }

  function init(){
    const input = document.getElementById("searchInput");
    if(input){
      const onSearch = debounce((value) => {
        M.searchQuery = value;
        window.OverSauceProducts?.renderMenu();
      }, 200);
      input.addEventListener("input", (e) => onSearch(e.target.value));
    }
    document.getElementById("clearSearchBtn")?.addEventListener("click", clearSearch);
  }

  window.OverSauceSearch = { init, clearSearch };
})();
