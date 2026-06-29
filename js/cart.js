/**
 * cart.js — Over Sauce Lounge Cart & Pricing Engine
 * ---------------------------------------------------------------------
 * Owns: cart line items (with size/extras variants), persistence,
 * coupon application, delivery-zone fee lookup, minimum-order
 * enforcement, and the cart drawer UI (including the premium empty
 * state illustration).
 *
 * PRICING ORDER OF OPERATIONS (must stay consistent everywhere):
 *   1. subtotal = sum(lineUnitPrice * qty) for every cart line
 *   2. discount = coupon applied against subtotal (fixed or percent)
 *   3. deliveryFee = zone fee if orderType === "delivery", else 0
 *   4. total = subtotal - discount + deliveryFee   (never below 0)
 * ---------------------------------------------------------------------
 */
(function(){
  const M = window.OverSauce;
  const { t, localized, formatPrice, toLocaleDigits, escapeHTML, clamp, findProduct, showToast, storageGetJSON, storageSetJSON, sanitizeLine } = window.OverSauceCore;

  /* =================================================================
     LINE KEY — a cart "line" is unique per product + size + sorted
     extras combination, so "Burger + Large + Cheese" and
     "Burger + Small" are tracked as separate rows.
     ================================================================= */
  function buildLineKey(productId, size, extras){
    const extrasKey = [...extras].sort().join(",");
    return `${productId}__${size || "none"}__${extrasKey || "none"}`;
  }

  function lineUnitPrice(line){
    let price = line.product.price;
    if(line.size){
      const sizeObj = (line.product.sizes || []).find(s => s.id === line.size);
      if(sizeObj) price += sizeObj.priceDiff;
    }
    line.extras.forEach(extraId => {
      const extraObj = (line.product.extras || []).find(ex => ex.id === extraId);
      if(extraObj) price += extraObj.price;
    });
    return price;
  }

  /* =================================================================
     PERSISTENCE — cart, applied coupon, order type, zone all survive
     a page refresh (explicit "cart persistence" requirement).
     ================================================================= */
  function serializeCart(){
    return Object.entries(M.cart).map(([key, line]) => ({
      key, productId: line.product.id, size: line.size, extras: line.extras, qty: line.qty
    }));
  }
  function persistCart(){
    storageSetJSON("cart", serializeCart());
    storageSetJSON("appliedCoupon", M.appliedCoupon);
    storageSetJSON("orderType", M.orderType);
    storageSetJSON("deliveryZoneId", M.deliveryZoneId);
  }
  function restoreCart(){
    const saved = storageGetJSON("cart", []);
    M.cart = {};
    saved.forEach(entry => {
      const product = findProduct(entry.productId);
      if(!product) return; // product may have been removed from the catalog since
      M.cart[entry.key] = { product, size: entry.size, extras: entry.extras || [], qty: entry.qty };
    });
    M.appliedCoupon = storageGetJSON("appliedCoupon", null);
    M.orderType = storageGetJSON("orderType", "delivery");
    M.deliveryZoneId = storageGetJSON("deliveryZoneId", null);
  }

  /* =================================================================
     CORE CALCULATIONS
     ================================================================= */
  function cartLines(){ return Object.values(M.cart); }
  function cartCount(){ return cartLines().reduce((sum, l) => sum + l.qty, 0); }
  function cartSubtotal(){ return cartLines().reduce((sum, l) => sum + lineUnitPrice(l) * l.qty, 0); }

  function activeDeliveryZone(){
    return M.deliveryZones.find(z => z.id === M.deliveryZoneId) || null;
  }
  function deliveryFee(){
    if(M.orderType !== "delivery") return 0;
    if(cartCount() === 0) return 0; // never charge delivery on an empty cart
    const zone = activeDeliveryZone();
    return zone ? zone.fee : 0;
  }

  function couponDiscount(subtotal){
    if(!M.appliedCoupon) return 0;
    if(subtotal < M.appliedCoupon.minOrder) return 0; // safety: re-validate every time, not just on apply
    if(M.appliedCoupon.type === "percentage"){
      return subtotal * (M.appliedCoupon.value / 100);
    }
    // Fixed discount can never exceed the subtotal (no negative totals)
    return Math.min(M.appliedCoupon.value, subtotal);
  }

  function cartTotals(){
    const subtotal = cartSubtotal();
    const discount = couponDiscount(subtotal);
    const fee = deliveryFee();
    const total = Math.max(0, subtotal - discount + fee);
    return { subtotal, discount, fee, total };
  }

  function meetsMinimumOrder(){
    return cartSubtotal() >= M.minimumOrder;
  }

  /* =================================================================
     CART MUTATIONS
     ================================================================= */
  function addToCart(product, opts = {}){
    const size = opts.size ?? null;
    const extras = opts.extras ?? [];
    const qty = clamp(opts.qty ?? 1, 1, M.config.maxQtyPerItem);
    const key = buildLineKey(product.id, size, extras);

    if(M.cart[key]){
      M.cart[key].qty = clamp(M.cart[key].qty + qty, 1, M.config.maxQtyPerItem);
    } else {
      M.cart[key] = { product, size, extras, qty };
    }
    persistCart();
    updateBadges();
    renderDrawer();
    showToast("toastAdded", "✅");
    bumpFab();
  }

  function incrementLine(key){
    if(!M.cart[key]) return;
    if(M.cart[key].qty >= M.config.maxQtyPerItem){
      const msg = M.lang === "ar" ? `الحد الأقصى ${toLocaleDigits(M.config.maxQtyPerItem)}` : `Maximum ${M.config.maxQtyPerItem} per item`;
      showToast(msg, "⚠️", true);
      return;
    }
    M.cart[key].qty++;
    persistCart();
    updateBadges();
    renderDrawer();
  }
  function decrementLine(key){
    if(!M.cart[key]) return;
    M.cart[key].qty--;
    if(M.cart[key].qty <= 0) delete M.cart[key];
    persistCart();
    updateBadges();
    renderDrawer();
  }
  function removeLine(key){
    delete M.cart[key];
    persistCart();
    updateBadges();
    renderDrawer();
    showToast("toastRemoved", "🗑️");
  }
  function clearCart(){
    M.cart = {};
    M.appliedCoupon = null;
    persistCart();
    updateBadges();
    renderDrawer();
  }

  function bumpFab(){
    const fab = document.getElementById("fabCart");
    if(!fab) return;
    fab.classList.add("bump");
    setTimeout(() => fab.classList.remove("bump"), 450);
  }

  /* =================================================================
     COUPONS
     ================================================================= */
  function applyCoupon(rawCode){
    const code = sanitizeLine(rawCode).toUpperCase();
    if(!code) return;
    const coupon = M.coupons.find(c => c.code.toUpperCase() === code && c.active);
    const errorEl = document.getElementById("couponError");
    const successEl = document.getElementById("couponSuccess");

    if(!coupon){
      M.appliedCoupon = null;
      if(errorEl){ errorEl.textContent = t("couponInvalid"); errorEl.classList.remove("hidden"); }
      if(successEl) successEl.classList.add("hidden");
      persistCart();
      renderDrawer();
      return;
    }
    if(cartSubtotal() < coupon.minOrder){
      M.appliedCoupon = null;
      if(errorEl){ errorEl.textContent = `${t("couponMinOrder")} (${formatPrice(coupon.minOrder)})`; errorEl.classList.remove("hidden"); }
      if(successEl) successEl.classList.add("hidden");
      persistCart();
      renderDrawer();
      return;
    }

    M.appliedCoupon = coupon;
    if(errorEl) errorEl.classList.add("hidden");
    if(successEl){ successEl.textContent = t("couponApplied"); successEl.classList.remove("hidden"); }
    persistCart();
    renderDrawer();
  }
  function removeCoupon(){
    M.appliedCoupon = null;
    persistCart();
    renderDrawer();
  }

  /* =================================================================
     EMPTY CART ILLUSTRATION (premium, brand-matched SVG)
     ================================================================= */
  function emptyCartSVG(){
    return `
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="var(--panel)" opacity="0.5"/>
      <path d="M34 44h6l4 32a6 6 0 0 0 6 5h26a6 6 0 0 0 6-5l4-24H40" stroke="var(--copper-light)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="50" cy="91" r="4.5" fill="var(--copper-light)"/>
      <circle cx="74" cy="91" r="4.5" fill="var(--copper-light)"/>
      <path d="M48 44V36a12 12 0 0 1 24 0v8" stroke="var(--brass)" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M46 56l4 4M70 56l-4 4" stroke="var(--brass)" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;
  }

  /* =================================================================
     LINE DESCRIPTION (size + extras, localized, for drawer + WhatsApp)
     ================================================================= */
  function lineVariantLabel(line){
    const parts = [];
    if(line.size){
      const sizeObj = (line.product.sizes || []).find(s => s.id === line.size);
      if(sizeObj) parts.push(localized(sizeObj.name));
    }
    line.extras.forEach(extraId => {
      const extraObj = (line.product.extras || []).find(ex => ex.id === extraId);
      if(extraObj) parts.push(localized(extraObj.name));
    });
    return parts.join(" · ");
  }

  /* =================================================================
     DRAWER RENDER
     ================================================================= */
  function renderDrawer(){
    const wrap = document.getElementById("cartItemsWrap");
    const footer = document.getElementById("cartFooter");
    if(!wrap || !footer) return;

    const entries = Object.entries(M.cart);
    if(!entries.length){
      wrap.innerHTML = `
        <div class="empty-state">
          <div class="empty-pulse">${emptyCartSVG()}</div>
          <h3 class="h3" style="font-size:1.15rem;">${t("cartEmptyTitle")}</h3>
          <p class="muted" style="font-size:0.88rem; max-width:220px;">${t("cartEmptyBody")}</p>
          <button class="btn-ghost" id="cartEmptyBrowseBtn">${t("cartEmptyCta")}</button>
        </div>`;
      document.getElementById("cartEmptyBrowseBtn")?.addEventListener("click", closeCart);
      footer.classList.add("hidden");
      return;
    }

    footer.classList.remove("hidden");
    wrap.innerHTML = entries.map(([key, line]) => {
      const variant = lineVariantLabel(line);
      return `
      <div class="cart-row" data-line-key="${key}">
        <img src="${line.product.image}" alt="${escapeHTML(localized(line.product.name))}" loading="lazy" decoding="async" width="64" height="64">
        <div class="cart-row-info">
          <p class="cart-row-name">${escapeHTML(localized(line.product.name))}</p>
          ${variant ? `<p class="cart-row-meta">${escapeHTML(variant)}</p>` : ""}
          <div class="qty-stepper" style="margin-top:8px;">
            <button class="qty-btn" data-decrement="${key}" aria-label="${M.lang === 'ar' ? 'تقليل الكمية' : 'Decrease quantity'}">−</button>
            <span class="qty-value">${toLocaleDigits(line.qty)}</span>
            <button class="qty-btn" data-increment="${key}" aria-label="${M.lang === 'ar' ? 'زيادة الكمية' : 'Increase quantity'}">+</button>
          </div>
        </div>
        <div class="cart-row-actions">
          <button class="cart-remove-btn tap-44" data-remove="${key}" aria-label="${M.lang === 'ar' ? 'حذف العنصر' : 'Remove item'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-7 0v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7H8Z"/></svg>
          </button>
          <span class="cart-row-price">${formatPrice(lineUnitPrice(line) * line.qty)}</span>
        </div>
      </div>`;
    }).join("");

    wrap.querySelectorAll("[data-increment]").forEach(b => b.addEventListener("click", () => incrementLine(b.getAttribute("data-increment"))));
    wrap.querySelectorAll("[data-decrement]").forEach(b => b.addEventListener("click", () => decrementLine(b.getAttribute("data-decrement"))));
    wrap.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => removeLine(b.getAttribute("data-remove"))));

    renderSummary();
  }

  function renderSummary(){
    const { subtotal, discount, fee, total } = cartTotals();
    const setText = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };

    setText("cartSubtotal", formatPrice(subtotal));
    setText("checkoutSubtotal", formatPrice(subtotal));

    const discountRow = document.getElementById("cartDiscountRow");
    const checkoutDiscountRow = document.getElementById("checkoutDiscountRow");
    if(discount > 0){
      setText("cartDiscount", `−${formatPrice(discount)}`);
      setText("checkoutDiscount", `−${formatPrice(discount)}`);
      discountRow?.classList.remove("hidden");
      checkoutDiscountRow?.classList.remove("hidden");
    } else {
      discountRow?.classList.add("hidden");
      checkoutDiscountRow?.classList.add("hidden");
    }

    const feeRow = document.getElementById("cartFeeRow");
    const checkoutFeeRow = document.getElementById("checkoutFeeRow");
    if(M.orderType === "delivery"){
      setText("cartFee", formatPrice(fee));
      setText("checkoutFee", formatPrice(fee));
      feeRow?.classList.remove("hidden");
      checkoutFeeRow?.classList.remove("hidden");
    } else {
      feeRow?.classList.add("hidden");
      checkoutFeeRow?.classList.add("hidden");
    }

    setText("cartTotal", formatPrice(total));
    setText("checkoutTotal", formatPrice(total));
    setText("checkoutItemCount", `${toLocaleDigits(cartCount())} ${M.lang === "ar" ? "أطباق" : "items"}`);

    const minOrderNotice = document.getElementById("minOrderNotice");
    if(minOrderNotice){
      if(M.orderType === "delivery" && !meetsMinimumOrder()){
        minOrderNotice.textContent = `${t("minOrderWarning")}: ${formatPrice(M.minimumOrder)}`;
        minOrderNotice.classList.remove("hidden");
      } else {
        minOrderNotice.classList.add("hidden");
      }
    }
  }

  /* =================================================================
     BADGES (header + FAB)
     ================================================================= */
  function updateBadges(){
    const count = cartCount();
    const { total } = cartTotals();

    const headerBadge = document.getElementById("headerCartCount");
    if(headerBadge){
      headerBadge.textContent = toLocaleDigits(count);
      headerBadge.classList.toggle("hidden", count === 0);
    }
    const fabBadge = document.getElementById("fabCartCount");
    if(fabBadge){
      fabBadge.textContent = toLocaleDigits(count);
      fabBadge.classList.toggle("hidden", count === 0);
    }
    const bottomBadge = document.getElementById("bottomCartCount");
    if(bottomBadge){
      bottomBadge.textContent = toLocaleDigits(count);
      bottomBadge.classList.toggle("hidden", count === 0);
    }
    const fabLabel = document.getElementById("fabCartLabel");
    if(fabLabel){
      fabLabel.textContent = count === 0 ? t("cartEmptyTitle") : `${t("cartTitle")} · ${formatPrice(total)}`;
    }
    const fab = document.getElementById("fabCart");
    if(fab){
      fab.style.opacity = count === 0 ? "0.55" : "1";
    }
  }

  /* =================================================================
     DRAWER OPEN / CLOSE
     ================================================================= */
  let lastFocusedEl = null;
  function openCart(){
    lastFocusedEl = document.activeElement;
    if(window.OverSauceCore) OverSauceCore.setPageTitle("cart");
    renderDrawer();
    document.getElementById("cartDrawer")?.classList.remove("closed");
    const scrim = document.getElementById("cartScrim");
    scrim?.classList.remove("hidden");
    requestAnimationFrame(() => scrim?.classList.add("active"));
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("cartDrawer")?.querySelector("button")?.focus({ preventScroll: true }), 300);
  }
  function closeCart(){
    if(window.OverSauceCore) OverSauceCore.setPageTitle("home");
    document.getElementById("cartDrawer")?.classList.add("closed");
    const scrim = document.getElementById("cartScrim");
    scrim?.classList.remove("active");
    setTimeout(() => scrim?.classList.add("hidden"), 400);
    document.body.style.overflow = "";
    if(lastFocusedEl) lastFocusedEl.focus();
  }

  /* =================================================================
     CHECKOUT MODAL
     ================================================================= */
  function populateDeliveryZoneSelect(){
    const select = document.getElementById("deliveryZoneSelect");
    if(!select) return;
    select.innerHTML = `<option value="" disabled ${M.deliveryZoneId ? "" : "selected"}>${t("chooseZone")}</option>` +
      M.deliveryZones.map(z => `
        <option value="${z.id}" ${z.id === M.deliveryZoneId ? "selected" : ""}>
          ${escapeHTML(localized(z.name))} — ${formatPrice(z.fee)}
        </option>
      `).join("");
  }

  function openCheckout(){
    if(cartCount() === 0){
      showToast("toastCartEmpty", "⚠️");
      return;
    }
    closeCart();
    populateDeliveryZoneSelect();
    renderSummary();

    const scrim = document.getElementById("checkoutScrim");
    const modal = document.getElementById("checkoutModal");
    if(!scrim || !modal) return;
    scrim.classList.remove("hidden");
    requestAnimationFrame(() => scrim.classList.add("active"));
    requestAnimationFrame(() => { modal.style.transform = "translateY(0)"; modal.style.opacity = "1"; });
    document.body.style.overflow = "hidden";
    setTimeout(() => document.getElementById("custName")?.focus({ preventScroll: true }), 350);
  }
  function closeCheckout(){
    const scrim = document.getElementById("checkoutScrim");
    const modal = document.getElementById("checkoutModal");
    if(!scrim || !modal) return;
    scrim.classList.remove("active");
    modal.style.transform = "";
    modal.style.opacity = "";
    setTimeout(() => scrim.classList.add("hidden"), 400);
    document.body.style.overflow = "";
  }

  /* =================================================================
     ORDER TYPE / ZONE WIRING
     ================================================================= */
  function setupOrderTypeToggle(){
    document.querySelectorAll('input[name="orderType"]').forEach(radio => {
      radio.addEventListener("change", (e) => {
        M.orderType = e.target.value;
        const zoneField = document.getElementById("deliveryZoneField");
        const addressField = document.getElementById("addressField");
        const isDelivery = M.orderType === "delivery";
        zoneField?.classList.toggle("hidden", !isDelivery);
        addressField?.classList.toggle("hidden", !isDelivery);
        persistCart();
        renderSummary();
      });
      if(radio.value === M.orderType) radio.checked = true;
    });
    document.getElementById("deliveryZoneSelect")?.addEventListener("change", (e) => {
      M.deliveryZoneId = e.target.value || null;
      persistCart();
      renderSummary();
    });
  }

  function setupCouponUI(){
    const applyBtn = document.getElementById("applyCouponBtn");
    const removeBtn = document.getElementById("removeCouponBtn");
    const input = document.getElementById("couponInput");
    applyBtn?.addEventListener("click", () => { if(input) applyCoupon(input.value); });
    input?.addEventListener("keydown", (e) => { if(e.key === "Enter"){ e.preventDefault(); applyCoupon(input.value); } });
    removeBtn?.addEventListener("click", () => { if(input) input.value = ""; removeCoupon(); });
  }

  /* =================================================================
     PUBLIC API
     ================================================================= */
  function init(){
    restoreCart();
    updateBadges();
    renderDrawer();
    setupOrderTypeToggle();
    setupCouponUI();

    document.getElementById("fabCart")?.addEventListener("click", openCart);
    document.getElementById("cartBtnHeader")?.addEventListener("click", openCart);
    document.getElementById("cartCloseBtn")?.addEventListener("click", closeCart);
    document.getElementById("cartScrim")?.addEventListener("click", (e) => { if(e.target.id === "cartScrim") closeCart(); });
    document.getElementById("checkoutOpenBtn")?.addEventListener("click", openCheckout);
    document.getElementById("checkoutCloseBtn")?.addEventListener("click", closeCheckout);
    document.getElementById("checkoutScrim")?.addEventListener("click", (e) => { if(e.target.id === "checkoutScrim") closeCheckout(); });
  }

  window.OverSauceCart = {
    init,
    addToCart,
    incrementLine,
    decrementLine,
    removeLine,
    clearCart,
    applyCoupon,
    removeCoupon,
    cartCount,
    cartSubtotal,
    cartTotals,
    meetsMinimumOrder,
    lineUnitPrice,
    lineVariantLabel,
    updateBadges,
    renderDrawer,
    renderSummary,
    openCart,
    closeCart,
    openCheckout,
    closeCheckout,
    activeDeliveryZone
  };
})();
