/**
 * whatsapp.js — Over Sauce Lounge WhatsApp Order Builder
 * ---------------------------------------------------------------------
 * Owns: checkout form validation, professional bilingual order-message
 * construction, and the success-animation -> WhatsApp deep-link flow.
 * Depends on: window.OverSauce (state), window.OverSauceCore (utils/i18n),
 * window.OverSauceCart (totals).
 * ---------------------------------------------------------------------
 */
(function(){
  const M = window.OverSauce;
  const { t, localized, formatPrice, toLocaleDigits, sanitizeLine, showToast } = window.OverSauceCore;

  /* =================================================================
     VALIDATION
     ================================================================= */
  function setFieldValidity(input, errorId, isValid){
    const errorEl = document.getElementById(errorId);
    input.classList.toggle("invalid", !isValid);
    if(errorEl) errorEl.classList.toggle("hidden", isValid);
    return isValid;
  }

  function validateCheckoutForm(){
    const nameInput = document.getElementById("custName");
    const phoneInput = document.getElementById("custPhone");
    const addressInput = document.getElementById("custAddress");
    const zoneSelect = document.getElementById("deliveryZoneSelect");
    const orderTypeInput = document.querySelector('input[name="orderType"]:checked');

    let valid = true;

    if(!orderTypeInput){
      showToast(M.lang === "ar" ? "يرجى اختيار طريقة الاستلام" : "Please choose an order type", "⚠️", true);
      return { valid: false };
    }
    const orderType = orderTypeInput.value;

    const name = sanitizeLine(nameInput.value);
    valid = setFieldValidity(nameInput, "custNameError", name.length >= 2) && valid;

    const phoneDigits = phoneInput.value.replace(/[^\d٠-٩]/g, "");
    valid = setFieldValidity(phoneInput, "custPhoneError", phoneDigits.length >= 8 && phoneDigits.length <= 15) && valid;

    if(orderType === "delivery"){
      const address = sanitizeLine(addressInput.value);
      valid = setFieldValidity(addressInput, "custAddressError", address.length >= 3) && valid;
      const zoneValid = !!zoneSelect.value;
      setFieldValidity(zoneSelect, "deliveryZoneError", zoneValid);
      valid = zoneValid && valid;
    }

    if(orderType === "delivery" && !window.OverSauceCart.meetsMinimumOrder()){
      showToast(`${t("minOrderWarning")}: ${formatPrice(M.minimumOrder)}`, "⚠️", true);
      valid = false;
    }

    if(!valid){
      showToast("requiredField", "⚠️");
      document.querySelector(".field.invalid")?.focus();
    }

    return {
      valid,
      orderType,
      name,
      phone: phoneInput.value.trim(),
      address: orderType === "delivery" ? sanitizeLine(addressInput.value) : "",
      zoneId: orderType === "delivery" ? zoneSelect.value : null,
      notes: sanitizeLine(document.getElementById("custNotes").value).slice(0, 200),
      payment: (document.querySelector('input[name="paymentMethod"]:checked') || {}).value || "cash"
    };
  }

  /* =================================================================
     MESSAGE BUILDER
     Produces the exact structure requested:
       Restaurant Order / Customer Name / Phone / Order Type / Zone /
       Items / Extras / Sizes / Subtotal / Delivery Fee / Discount /
       Final Total / Notes
     Bilingual: labels follow the active UI language so the restaurant
     receives a message matching what the customer saw on screen.
     ================================================================= */
  function buildOrderMessage(formData, orderNumber){
    const isAr = M.lang === "ar";
    const restaurantName = M.restaurant ? localized(M.restaurant.name) : "Over Sauce Lounge";
    const { subtotal, discount, fee, total } = window.OverSauceCart.cartTotals();
    const zone = formData.zoneId ? M.deliveryZones.find(z => z.id === formData.zoneId) : null;

    const lines = [];
    lines.push(`*${isAr ? "طلب جديد" : "New Order"} — ${restaurantName}*`);
    lines.push("━━━━━━━━━━━━━━━");
    if(orderNumber){
      lines.push(`🔖 *${isAr ? "رقم الطلب" : "Order No."}:* ${orderNumber}`);
    }
    lines.push(`👤 *${isAr ? "اسم العميل" : "Customer Name"}:* ${formData.name}`);
    lines.push(`📞 *${isAr ? "رقم الهاتف" : "Phone Number"}:* ${formData.phone}`);
    lines.push(`📦 *${isAr ? "طريقة الاستلام" : "Order Type"}:* ${formData.orderType === "delivery" ? (isAr ? "توصيل" : "Delivery") : (isAr ? "استلام من الفرع" : "Pickup")}`);
    if(formData.orderType === "delivery"){
      if(zone) lines.push(`🗺️ *${isAr ? "منطقة التوصيل" : "Delivery Zone"}:* ${localized(zone.name)}`);
      lines.push(`📍 *${isAr ? "العنوان" : "Address"}:* ${formData.address}`);
    }
    lines.push("");
    lines.push(`🍽️ *${isAr ? "الأطباق المطلوبة" : "Items"}:*`);

    Object.values(M.cart).forEach(line => {
      const unitPrice = window.OverSauceCart.lineUnitPrice(line);
      const name = localized(line.product.name);
      lines.push(`• ${name} × ${toLocaleDigits(line.qty)} — ${formatPrice(unitPrice * line.qty)}`);

      if(line.size){
        const sizeObj = (line.product.sizes || []).find(s => s.id === line.size);
        if(sizeObj) lines.push(`   ${isAr ? "الحجم" : "Size"}: ${localized(sizeObj.name)}`);
      }
      if(line.extras && line.extras.length){
        const extraNames = line.extras
          .map(extraId => (line.product.extras || []).find(ex => ex.id === extraId))
          .filter(Boolean)
          .map(ex => localized(ex.name));
        if(extraNames.length) lines.push(`   ${isAr ? "إضافات" : "Extras"}: ${extraNames.join("، ")}`);
      }
    });

    lines.push("━━━━━━━━━━━━━━━");
    lines.push(`💵 *${isAr ? "المجموع الفرعي" : "Subtotal"}:* ${formatPrice(subtotal)}`);
    if(formData.orderType === "delivery"){
      lines.push(`🚚 *${isAr ? "رسوم التوصيل" : "Delivery Fee"}:* ${formatPrice(fee)}`);
    }
    if(discount > 0){
      const couponLabel = M.appliedCoupon ? ` (${M.appliedCoupon.code})` : "";
      lines.push(`🏷️ *${isAr ? "الخصم" : "Discount"}:* −${formatPrice(discount)}${couponLabel}`);
    }
    lines.push(`💰 *${isAr ? "الإجمالي النهائي" : "Final Total"}:* ${formatPrice(total)}`);

    const payLabels = {
      cash:     isAr ? "نقدًا عند الاستلام" : "Cash on delivery",
      mada:     "مدى (Mada)",
      applepay: "Apple Pay",
      stcpay:   "STC Pay",
      card:     isAr ? "بطاقة" : "Card"
    };
    lines.push(`💳 *${isAr ? "طريقة الدفع" : "Payment"}:* ${payLabels[formData.payment] || payLabels.cash}`);

    if(formData.notes){
      lines.push("");
      lines.push(`📝 *${isAr ? "ملاحظات" : "Notes"}:* ${formData.notes}`);
    }

    lines.push("");
    lines.push(isAr ? `_تم إرسال هذا الطلب عبر الموقع الرقمي لـ${restaurantName}_` : `_This order was sent via the ${restaurantName} digital menu_`);

    return lines.join("\n");
  }

  function buildWhatsAppUrl(message){
    const number = (M.restaurant && M.restaurant.whatsapp) || M.config.whatsappNumber;
    const encoded = encodeURIComponent(message);
    return `https://wa.me/${number}?text=${encoded}`;
  }

  /* =================================================================
     ORDER PAYLOAD — snapshot of the cart + customer info, stored in the
     database before redirecting to WhatsApp so staff have a full record.
     ================================================================= */
  function buildOrderPayload(formData){
    const { subtotal, discount, fee, total } = window.OverSauceCart.cartTotals();
    const zone = formData.zoneId ? M.deliveryZones.find(z => z.id === formData.zoneId) : null;

    const items = Object.values(M.cart).map(line => {
      const unitPrice = window.OverSauceCart.lineUnitPrice(line);
      const sizeObj = line.size ? (line.product.sizes || []).find(s => s.id === line.size) : null;
      const extras = (line.extras || [])
        .map(id => (line.product.extras || []).find(ex => ex.id === id))
        .filter(Boolean)
        .map(ex => ({ ar: (ex.name && ex.name.ar) || "", en: (ex.name && ex.name.en) || "" }));
      return {
        productId: line.product.id,
        name: { ar: line.product.name.ar, en: line.product.name.en },
        size: sizeObj ? { ar: (sizeObj.name && sizeObj.name.ar) || "", en: (sizeObj.name && sizeObj.name.en) || "" } : null,
        extras: extras,
        qty: line.qty,
        unitPrice: unitPrice,
        lineTotal: unitPrice * line.qty
      };
    });

    return {
      id: "ord_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      customerName: formData.name,
      phone: formData.phone,
      address: formData.address || "",
      mapsLink: "",
      orderType: formData.orderType,
      zone: zone ? `${(zone.name && zone.name.ar) || ""} / ${(zone.name && zone.name.en) || ""}`.trim() : "",
      items: items,
      notes: formData.notes || "",
      couponCode: M.appliedCoupon ? M.appliedCoupon.code : "",
      discount: discount || 0,
      vat: 0,
      deliveryFee: formData.orderType === "delivery" ? (fee || 0) : 0,
      subtotal: subtotal || 0,
      grandTotal: total || 0,
      paymentMethod: formData.payment || "cash",
      source: "website",
      status: "pending",
      assignedEmployee: "",
      timeline: [{ type: "created", to: "pending", by: M.lang === "ar" ? "العميل" : "Customer", at: new Date().toISOString() }]
    };
  }

  /* =================================================================
     SUCCESS OVERLAY + SUBMISSION FLOW
     ================================================================= */
  function showSuccessAndRedirect(url, sendBtn){
    const overlay = document.getElementById("successOverlay");
    const check = document.getElementById("successCheck");
    if(!overlay || !check){
      // No overlay present — degrade gracefully, just navigate.
      window.open(url, "_blank", "noopener,noreferrer") || (window.location.href = url);
      return;
    }
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => overlay.style.opacity = "1");
    requestAnimationFrame(() => check.style.transform = "scale(1)");

    setTimeout(() => {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if(!win){
        // Popup blocked — never lose the order, fall back to same-tab nav.
        window.location.href = url;
      }
      setTimeout(() => {
        overlay.style.opacity = "0";
        check.style.transform = "scale(0)";
        setTimeout(() => overlay.classList.add("hidden"), 400);
        window.OverSauceCart.closeCheckout();
        resetAfterOrder();
        if(sendBtn) sendBtn.disabled = false;
      }, 900);
    }, 1100);
  }

  function resetAfterOrder(){
    window.OverSauceCart.clearCart();
    const form = document.getElementById("checkoutForm");
    form?.reset();
    document.querySelectorAll(".field.invalid").forEach(f => f.classList.remove("invalid"));
    document.querySelectorAll('[id$="Error"]').forEach(e => e.classList.add("hidden"));
    showToast("toastOrderSent", "🎉");
  }

  async function sendOrder(){
    if(M.restaurant && M.restaurant.features && M.restaurant.features.whatsappOrdering === false){
      showToast(M.lang === "ar" ? "الطلب غير متاح حاليًا" : "Ordering is currently unavailable", "🚫", true);
      return;
    }
    if(M.restaurant && M.restaurant.ordersPaused){
      showToast(M.lang === "ar" ? "الطلبات متوقفة مؤقتًا حاليًا" : "Orders are temporarily paused", "🚫", true);
      return;
    }
    if(window.OverSauceCart.cartCount() === 0){
      showToast("toastCartEmpty", "⚠️");
      return;
    }
    const formData = validateCheckoutForm();
    if(!formData.valid) return;

    const sendBtn = document.getElementById("sendOrderBtn");
    if(sendBtn) sendBtn.disabled = true;

    // Save the order to the database first so staff have a record and we can
    // stamp the order number on the WhatsApp message. Never block the order
    // if the database is unreachable — the customer always reaches WhatsApp.
    let orderNumber = null;
    if(window.OSDB && OSDB.isConfigured()){
      try {
        const saved = await OSDB.createOrder(buildOrderPayload(formData));
        if(saved && saved.orderNumber) orderNumber = saved.orderNumber;
      } catch(e){ /* swallow — order still goes through to WhatsApp */ }
    }

    const message = buildOrderMessage(formData, orderNumber);
    const url = buildWhatsAppUrl(message);
    showSuccessAndRedirect(url, sendBtn);
  }

  /* =================================================================
     INIT
     ================================================================= */
  function init(){
    document.getElementById("sendOrderBtn")?.addEventListener("click", sendOrder);
  }

  window.OverSauceWhatsApp = { init, buildOrderMessage, buildWhatsAppUrl, sendOrder };

  document.addEventListener("DOMContentLoaded", () => {
    // Deferred slightly so cart.js/products.js have attached first;
    // this module only needs the DOM nodes to exist, not the data.
    init();
  });
})();
