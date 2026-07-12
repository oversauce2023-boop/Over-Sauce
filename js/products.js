/**
 * products.js — Over Sauce Lounge Catalog Module
 * ---------------------------------------------------------------------
 * Owns: category nav, product grid rendering (skeleton -> real),
 * sort/filter pipeline, favorites, recently-viewed, and the product
 * detail modal (size selection, extras, quantity, add-to-cart).
 * Depends on: window.OverSauce (state), window.OverSauceCore (utils/i18n).
 * ---------------------------------------------------------------------
 */
(function(){
  const M = window.OverSauce;
  const { t, localized, formatPrice, toLocaleDigits, escapeHTML, clamp, findProduct, showToast, storageGetJSON, storageSetJSON, setupRevealObserver } = window.OverSauceCore;

  let menuRendered = false;
  let scrollSpyObserver = null;
  let activeModalProduct = null;
  let modalState = { size: null, extras: new Set(), qty: 1 };

  /* =================================================================
     BADGE / RATING HELPERS
     ================================================================= */
  const BADGE_CLASS = { new: "badge-new", best: "badge-best", spicy: "badge-spicy" };
  function badgeLabel(b){
    if(b === "new") return t("badgeNew");
    if(b === "best") return t("badgeBest");
    if(b === "spicy") return t("badgeSpicy");
    return b;
  }
  function badgesHTML(product){
    const badges = [...(product.badges || [])];
    let html = "";
    if(product.oldPrice && product.oldPrice > product.price){
      const pct = Math.round((1 - product.price / product.oldPrice) * 100);
      const pctLabel = M.lang === "ar" ? `${toLocaleDigits(pct)}٪` : `${pct}%`;
      html += `<span class="badge badge-sale">${t("badgeDiscount")} ${pctLabel}</span>`;
    }
    badges.forEach(b => {
      if(BADGE_CLASS[b]) html += `<span class="badge ${BADGE_CLASS[b]}">${badgeLabel(b)}</span>`;
    });
    if(!product.inStock){
      html += `<span class="badge badge-outofstock">${t("outOfStock")}</span>`;
    }
    return html ? `<div class="product-badges">${html}</div>` : "";
  }
  function ratingHTML(product){
    const ordersWord = M.lang === "ar" ? "طلب" : "orders";
    return `<span class="rating-stars" aria-hidden="true">★</span> ${toLocaleDigits(product.rating)} · ${toLocaleDigits(product.orders)} ${ordersWord}`;
  }

  /* =================================================================
     RECENTLY VIEWED (persisted, capped)
     ================================================================= */
  function loadRecentlyViewed(){
    M.recentlyViewed = storageGetJSON("recentlyViewed", []);
  }
  function pushRecentlyViewed(productId){
    M.recentlyViewed = [productId, ...M.recentlyViewed.filter(id => id !== productId)].slice(0, M.config.maxRecentlyViewed);
    storageSetJSON("recentlyViewed", M.recentlyViewed);
    renderRecentlyViewed();
  }
  function renderRecentlyViewed(){
    const section = document.getElementById("recentlyViewedSection");
    const wrap = document.getElementById("recentlyViewedGrid");
    if(!section || !wrap) return;
    const items = M.recentlyViewed.map(findProduct).filter(Boolean);
    if(!items.length){
      section.classList.add("hidden");
      return;
    }
    section.classList.remove("hidden");
    wrap.innerHTML = items.map(productCardHTML).join("");
    bindCardEvents(wrap);
  }

  /* =================================================================
     CATEGORY NAV
     ================================================================= */
  function renderCategoryNav(){
    const nav = document.getElementById("categoryNav");
    if(!nav) return;
    nav.innerHTML = M.categories.map(cat => {
      const count = M.products.filter(p => p.category === cat.id).length;
      const itemsWord = M.lang === "ar" ? "صنف" : "items";
      return `
      <button class="stamp-pill ${cat.id === M.activeCategory ? 'active' : ''}"
              data-cat="${cat.id}" role="tab" aria-selected="${cat.id === M.activeCategory ? 'true' : 'false'}">
        <span aria-hidden="true">${cat.icon}</span>
        <span class="stamp-text"><span class="stamp-name">${escapeHTML(localized(cat.name))}</span><small class="stamp-count">${toLocaleDigits(count)} ${itemsWord}</small></span>
      </button>`;
    }).join("");
    nav.querySelectorAll("[data-cat]").forEach(btn => {
      btn.addEventListener("click", () => scrollToCategory(btn.getAttribute("data-cat")));
    });
  }
  // Scroll the horizontal category strip ONLY (never the page) to center a chip.
  function centerNavChip(catId){
    const nav = document.getElementById("categoryNav");
    if(!nav) return;
    const chip = nav.querySelector(`[data-cat="${catId}"]`);
    if(!chip) return;
    const navRect = nav.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const left = nav.scrollLeft + (chipRect.left - navRect.left) - (nav.clientWidth - chip.clientWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }
  // Update active chip in place (no DOM rebuild) + center it horizontally.
  function setActiveNavChip(catId){
    M.activeCategory = catId;
    const nav = document.getElementById("categoryNav");
    if(!nav) return;
    nav.querySelectorAll("[data-cat]").forEach(btn => {
      const on = btn.getAttribute("data-cat") === catId;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    centerNavChip(catId);
  }
  function scrollToCategory(catId){
    setActiveNavChip(catId);
    const target = document.getElementById(`cat-${catId}`);
    if(!target) return;
    const header = document.getElementById("siteHeader");
    const offset = (header ? header.offsetHeight : 0) + 12;
    const y = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }
  function setupScrollSpy(){
    if(scrollSpyObserver) scrollSpyObserver.disconnect();
    const sections = M.categories.map(c => document.getElementById(`cat-${c.id}`)).filter(Boolean);
    if(!sections.length) return;
    scrollSpyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          const catId = entry.target.id.replace("cat-", "");
          if(catId !== M.activeCategory){
            setActiveNavChip(catId);
          }
        }
      });
    }, { rootMargin: "-160px 0px -60% 0px", threshold: 0 });
    sections.forEach(s => scrollSpyObserver.observe(s));
  }

  /* =================================================================
     SORT + FILTER PIPELINE
     ================================================================= */
  function applySortAndFilter(items){
    let result = [...items];
    const { min, max } = M.priceFilter;
    if(min != null) result = result.filter(p => p.price >= min);
    if(max != null) result = result.filter(p => p.price <= max);

    switch(M.sortMode){
      case "priceAsc": result.sort((a,b) => a.price - b.price); break;
      case "priceDesc": result.sort((a,b) => b.price - a.price); break;
      case "rating": result.sort((a,b) => b.rating - a.rating); break;
      case "popular": result.sort((a,b) => b.orders - a.orders); break;
      default: break; // "default" preserves catalog order
    }
    return result;
  }

  // توحيد الحروف العربية المتشابهة (الهمزات، الألف المقصورة، التاء المربوطة)
  // حتى يجد البحث "اومليت" عند البحث عن "أومليت" والعكس.
  function normalizeArabic(str){
    return (str || "")
      .toLowerCase()
      .replace(/[أإآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchesSearch(product, query){
    if(!query) return true;
    const q = normalizeArabic(query);
    if(!q) return true;
    const nameAr = normalizeArabic(product.name.ar || "");
    const nameEn = (product.name.en || "").toLowerCase();
    const descLocalized = normalizeArabic(localized(product.description));
    const haystack = `${nameAr} ${nameEn} ${descLocalized}`;
    // مطابقة كل كلمة على حدة بأي ترتيب، بدل الجملة كاملة كوحدة واحدة.
    const words = q.split(" ").filter(Boolean);
    return words.every(w => haystack.includes(w));
  }

  /* =================================================================
     PRODUCT CARD MARKUP
     ================================================================= */
  function productCardHTML(product){
    const oldPriceHTML = product.oldPrice ? `<span class="product-old-price">${formatPrice(product.oldPrice)}</span>` : "";
    return `
    <article class="product-card reveal in" data-product-id="${product.id}" data-name="${escapeHTML(localized(product.name))}">
      <div class="product-img-wrap">
        <div class="shimmer" style="position:absolute; inset:0;" data-skeleton></div>
        <img class="product-img" src="${product.image}" alt="${escapeHTML(localized(product.name))}" loading="lazy" decoding="async" width="600" height="400">
        ${badgesHTML(product)}
      </div>
      <div class="product-body">
        <div class="product-name-row">
          <h3 class="product-name">${escapeHTML(localized(product.name))}</h3>
          <div class="product-price-wrap">
            ${oldPriceHTML}
            <span class="product-price">${formatPrice(product.price)}</span>
          </div>
        </div>
        <p class="product-desc">${escapeHTML(localized(product.description))}</p>
        ${product.calories != null && product.calories > 0 ? `<p class="product-calories">🔥 ${toLocaleDigits(product.calories)} ${M.lang === "ar" ? "سعرة حرارية" : "kcal"}</p>` : ""}
        <p class="product-meta">${ratingHTML(product)}</p>
        ${!product.inStock ? `<p class="product-unavailable">${t("outOfStock")}</p>` : ""}
      </div>
    </article>`;
  }

  function bindCardEvents(scope){
    scope.querySelectorAll("img.product-img").forEach(img => {
      if(img.complete && img.naturalWidth > 0){
        img.classList.add("loaded");
        img.previousElementSibling?.remove();
      } else {
        img.addEventListener("load", () => { img.classList.add("loaded"); img.previousElementSibling?.remove(); });
        img.addEventListener("error", () => { img.previousElementSibling?.remove(); });
      }
    });
    scope.querySelectorAll("[data-open-product]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-open-product");
        openProductModal(id);
      });
    });
    scope.querySelectorAll(".product-card").forEach(card => {
      card.addEventListener("click", () => openProductModal(card.getAttribute("data-product-id")));
    });
  }

  /* =================================================================
     SKELETON PLACEHOLDER
     ================================================================= */
  function renderMenuSkeleton(){
    const skeleton = document.getElementById("menuSkeleton");
    if(!skeleton) return;
    skeleton.innerHTML = Array.from({ length: 8 }).map(() => `
      <div style="border:1px solid var(--line); border-radius:var(--radius-lg); overflow:hidden;">
        <div class="shimmer" style="height:180px;"></div>
        <div style="padding:16px; display:flex; flex-direction:column; gap:10px;">
          <div class="shimmer" style="height:16px; width:75%; border-radius:6px;"></div>
          <div class="shimmer" style="height:12px; width:100%; border-radius:6px;"></div>
          <div class="shimmer" style="height:12px; width:85%; border-radius:6px;"></div>
          <div class="shimmer" style="height:36px; width:100%; border-radius:999px; margin-top:6px;"></div>
        </div>
      </div>
    `).join("");
  }

  /* =================================================================
     MAIN MENU RENDER (search + category sections + empty state)
     ================================================================= */
  function renderMenu(){
    const container = document.getElementById("menuContainer");
    const empty = document.getElementById("emptyState");
    const skeleton = document.getElementById("menuSkeleton");
    if(!container || !empty) return;

    let anyResults = false;
    let html = "";

    M.categories.forEach(cat => {
      const inCategory = M.products.filter(p => p.category === cat.id && matchesSearch(p, M.searchQuery));
      const filtered = applySortAndFilter(inCategory);
      if(!filtered.length) return;
      anyResults = true;
      const itemsWord = M.lang === "ar" ? "أطباق" : "items";
      html += `
      <section id="cat-${cat.id}" class="reveal in" style="margin-bottom:56px; scroll-margin-top:160px;" aria-labelledby="cat-${cat.id}-heading">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:24px;">
          <span style="font-size:1.5rem;" aria-hidden="true">${cat.icon}</span>
          <h3 id="cat-${cat.id}-heading" class="h3">${escapeHTML(localized(cat.name))}</h3>
          <span style="height:1px; flex:1; background:var(--line);"></span>
          <span class="muted" style="font-size:0.78rem; font-weight:700;">${toLocaleDigits(filtered.length)} ${itemsWord}</span>
        </div>
        <div class="product-grid">
          ${filtered.map(productCardHTML).join("")}
        </div>
      </section>`;
    });

    container.innerHTML = html;
    empty.classList.toggle("hidden", anyResults);
    empty.classList.toggle("flex", !anyResults);
    bindCardEvents(container);

    if(!menuRendered){
      menuRendered = true;
      if(skeleton){
        skeleton.style.opacity = "0";
        setTimeout(() => {
          skeleton.classList.add("hidden");
          container.classList.remove("hidden");
        }, 200);
      } else {
        container.classList.remove("hidden");
      }
    } else {
      container.classList.remove("hidden");
    }
    setupScrollSpy();
  }

  /* =================================================================
     FEATURED / MOST-ORDERED / BEST-SELLERS HORIZONTAL RAILS
     ================================================================= */
  function renderRail(elementId, items){
    const wrap = document.getElementById(elementId);
    if(!wrap) return;
    wrap.innerHTML = items.map(productCardHTML).join("");
    bindCardEvents(wrap);
  }
  function renderHomeRails(){
    const featured = M.products.filter(p => p.badges?.includes("new") && p.inStock).slice(0, 8);
    const mostOrdered = [...M.products].sort((a,b) => b.orders - a.orders).slice(0, 8);
    const bestSellers = M.products.filter(p => p.badges?.includes("best") && p.inStock).slice(0, 8);
    renderRail("featuredGrid", featured.length ? featured : M.products.slice(0, 8));
    renderRail("mostOrderedGrid", mostOrdered);
    renderRail("bestSellersGrid", bestSellers.length ? bestSellers : mostOrdered);
  }

  /* =================================================================
     RELATED PRODUCTS (same category, excluding current)
     ================================================================= */
  function renderRelated(currentProduct){
    const wrap = document.getElementById("relatedGrid");
    if(!wrap) return;
    const related = M.products
      .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
      .sort((a,b) => b.rating - a.rating)
      .slice(0, 4);
    wrap.innerHTML = related.map(productCardHTML).join("");
    bindCardEvents(wrap);
  }

  /* =================================================================
     PRODUCT DETAIL MODAL — عرض معلوماتي كامل للطبق (بلا طلب/سلة)
     ================================================================= */
  function renderModalPrice(product){
    const priceEl = document.getElementById("productModalPrice");
    if(priceEl) priceEl.textContent = formatPrice(product.price);
    const stockEl = document.getElementById("productModalStock");
    if(stockEl){
      stockEl.textContent = product.inStock ? t("inStock") : t("outOfStock");
      stockEl.style.color = product.inStock ? "var(--success, #2e9e5b)" : "var(--danger, #d94b4b)";
    }
  }

  function openProductModal(productId){
    const product = findProduct(productId);
    if(!product) return;
    activeModalProduct = product;
    modalState = { size: product.sizes?.[0]?.id ?? null, extras: new Set(), qty: 1 };
    pushRecentlyViewed(productId);

    const scrim = document.getElementById("productScrim");
    const modal = document.getElementById("productModal");
    if(!scrim || !modal) return;

    document.getElementById("productModalImg").src = product.image;
    document.getElementById("productModalImg").alt = localized(product.name);
    document.getElementById("productModalName").textContent = localized(product.name);
    document.getElementById("productModalDesc").textContent = localized(product.description);
    document.getElementById("productModalRating").innerHTML = ratingHTML(product);
    document.getElementById("productModalBadges").innerHTML = badgesHTML(product);

    // Calories + allergens (hidden when not provided for a dish)
    const nutritionWrap = document.getElementById("productModalNutrition");
    const calEl = document.getElementById("productModalCalories");
    const allergEl = document.getElementById("productModalAllergens");
    const hasCal = product.calories != null && product.calories > 0;
    const hasAllerg = !!(product.allergens && product.allergens.length);
    if(calEl){
      if(hasCal){
        calEl.textContent = `🔥 ${toLocaleDigits(product.calories)} ${M.lang === "ar" ? "سعرة حرارية" : "kcal"}`;
        calEl.classList.remove("hidden");
      } else { calEl.classList.add("hidden"); }
    }
    if(allergEl){
      if(hasAllerg){
        const label = M.lang === "ar" ? "يحتوي على:" : "Contains:";
        allergEl.innerHTML = `<span class="allergens-label">⚠️ ${label}</span>` +
          product.allergens.map(a => `<span class="allergen-chip">${escapeHTML(a)}</span>`).join("");
        allergEl.classList.remove("hidden");
      } else { allergEl.classList.add("hidden"); }
    }
    if(nutritionWrap) nutritionWrap.classList.toggle("hidden", !(hasCal || hasAllerg));

    const sizesWrap = document.getElementById("productModalSizes");
    const sizesSection = document.getElementById("productModalSizesSection");
    if(product.sizes && product.sizes.length){
      sizesSection.classList.remove("hidden");
      // عرض معلوماتي فقط (بدون اختيار) — يوضح للعميل الأحجام المتاحة وفروق أسعارها.
      sizesWrap.innerHTML = product.sizes.map(s => `
        <span class="size-pill">
          ${escapeHTML(localized(s.name))} ${s.priceDiff !== 0 ? `(${s.priceDiff > 0 ? '+' : ''}${formatPrice(s.priceDiff)})` : ''}
        </span>
      `).join("");
    } else {
      sizesSection.classList.add("hidden");
    }

    const extrasWrap = document.getElementById("productModalExtras");
    const extrasSection = document.getElementById("productModalExtrasSection");
    if(product.extras && product.extras.length){
      extrasSection.classList.remove("hidden");
      // عرض معلوماتي فقط (بدون اختيار) — يوضح الإضافات المتاحة وأسعارها.
      extrasWrap.innerHTML = product.extras.map(ex => `
        <span class="extra-pill">
          ${escapeHTML(localized(ex.name))} (+${formatPrice(ex.price)})
        </span>
      `).join("");
    } else {
      extrasSection.classList.add("hidden");
    }

    renderModalPrice(product);
    renderRelated(product);

    scrim.classList.remove("hidden");
    requestAnimationFrame(() => scrim.classList.add("active"));
    modal.classList.remove("translate-y-full");
    requestAnimationFrame(() => { modal.style.transform = "translateY(0)"; modal.style.opacity = "1"; });
    lockBodyScroll();
  }

  function closeProductModal(){
    const scrim = document.getElementById("productScrim");
    const modal = document.getElementById("productModal");
    if(!scrim || !modal) return;
    scrim.classList.remove("active");
    modal.style.transform = "";
    modal.style.opacity = "";
    setTimeout(() => scrim.classList.add("hidden"), 350);
    unlockBodyScroll();
    activeModalProduct = null;
  }

  function setupProductModalControls(){
    /* عداد الكمية وزر الإضافة أُزيلا — المودال للعرض المعلوماتي فقط */
    document.getElementById("productModalCloseBtn")?.addEventListener("click", closeProductModal);
    document.getElementById("productScrim")?.addEventListener("click", (e) => {
      if(e.target.id === "productScrim") closeProductModal();
    });
    document.getElementById("productModalShareBtn")?.addEventListener("click", async () => {
      if(!activeModalProduct) return;
      const url = `${window.location.origin}${window.location.pathname}#product-${activeModalProduct.id}`;
      if(navigator.share){
        try { await navigator.share({ title: localized(activeModalProduct.name), url }); return; } catch(e){ /* user cancelled */ }
      }
      try { await navigator.clipboard.writeText(url); showToast("toastLinkCopied", "🔗"); } catch(e){ showToast("toastLinkCopied", "🔗"); }
    });
  }

  /* =================================================================
     SORT / FILTER UI WIRING
     ================================================================= */
  function setupSortFilterUI(){
    const sortSelect = document.getElementById("sortSelect");
    if(sortSelect){
      sortSelect.addEventListener("change", () => {
        M.sortMode = sortSelect.value;
        renderMenu();
      });
    }
    const minInput = document.getElementById("priceMinInput");
    const maxInput = document.getElementById("priceMaxInput");
    const applyFilterBtn = document.getElementById("applyPriceFilterBtn");
    if(applyFilterBtn){
      applyFilterBtn.addEventListener("click", () => {
        const minVal = minInput.value ? Number(minInput.value) : null;
        const maxVal = maxInput.value ? Number(maxInput.value) : null;
        // Guard against an inverted range (min > max) which would silently
        // return zero results — swap them instead of confusing the user.
        if(minVal != null && maxVal != null && minVal > maxVal){
          M.priceFilter.min = maxVal;
          M.priceFilter.max = minVal;
        } else {
          M.priceFilter.min = minVal;
          M.priceFilter.max = maxVal;
        }
        renderMenu();
      });
    }
  }

  /* =================================================================
     PUBLIC API
     ================================================================= */
  function renderAll(){
    renderMenu();
    renderHomeRails();
    renderRecentlyViewed();
  }

  function init(){
    loadRecentlyViewed();
    renderMenuSkeleton();
    renderCategoryNav();
    renderAll();
    setupProductModalControls();
    setupSortFilterUI();
  }

  window.OverSauceProducts = {
    init,
    renderAll,
    renderMenu,
    renderCategoryNav,
    openProductModal,
    closeProductModal,
    productCardHTML,
    bindCardEvents
  };
})();
