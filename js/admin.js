/**
 * admin.js — Over Sauce Lounge Admin Dashboard
 * ---------------------------------------------------------------------
 * A no-backend admin panel: all edits happen in-memory (seeded from
 * localStorage if a previous session saved data, otherwise from the
 * bundled /data/*.json files) and are persisted to localStorage as you
 * go. Use the Import/Export tab to download updated JSON files and
 * hand them to a developer to replace /data/*.json on the live site —
 * this panel cannot write directly to disk from the browser.
 *
 * SECURITY NOTE: the PIN gate is a UX deterrent for shared devices,
 * not real authentication. A static site has no server to enforce
 * access control; production deployments should put this directory
 * behind real auth (e.g. a reverse proxy or hosting-platform login).
 * ---------------------------------------------------------------------
 */
(function(){
  const STORAGE_KEY = "oversauce_admin_data";
  const PIN_KEY = "oversauce_admin_pin";
  const DEFAULT_PIN = "1234";

  let db = { categories: [], products: [], coupons: [], flashDeals: [], deliveryZones: [], minimumOrder: 0, restaurant: null };

  /* =================================================================
     STORAGE
     ================================================================= */
  function storageGet(key){ try { return localStorage.getItem(key); } catch(e){ return null; } }
  function storageSet(key, value){ try { localStorage.setItem(key, value); } catch(e){ /* degrade silently */ } }

  async function loadDB(){
    if(window.OSDB && OSDB.isConfigured()){
      try {
        const data = await OSDB.fetchAll();
        db = {
          categories: data.categories,
          products: data.products,
          coupons: data.coupons,
          flashDeals: data.flashDeals,
          deliveryZones: data.zones,
          minimumOrder: data.minimumOrder,
          restaurant: data.restaurant,
          currency: data.currency
        };
        return;
      } catch(e){
        console.warn("[admin] Supabase load failed; using local data.", e);
      }
    }
    const saved = storageGet(STORAGE_KEY);
    if(saved){
      try { db = JSON.parse(saved); return; }
      catch(e){ /* fall through to fetch fresh data */ }
    }
    const [cats, prods, coupons, zones] = await Promise.all([
      fetch("../data/categories.json").then(r => r.json()),
      fetch("../data/products.json").then(r => r.json()),
      fetch("../data/coupons.json").then(r => r.json()),
      fetch("../data/delivery-zones.json").then(r => r.json())
    ]);
    db = {
      categories: cats.categories,
      products: prods.products,
      coupons: coupons.coupons,
      flashDeals: coupons.flashDeals,
      deliveryZones: zones.deliveryZones,
      minimumOrder: zones.minimumOrder,
      restaurant: zones.restaurant
    };
  }
  function saveDB(){
    if(window.OSDB && OSDB.isConfigured()){
      OSDB.syncAll(db).catch((e) => {
        console.error("[admin] sync failed", e);
        showToast("فشل الحفظ في قاعدة البيانات — تأكد من تسجيل دخولك", "⚠️");
      });
      return;
    }
    storageSet(STORAGE_KEY, JSON.stringify(db));
  }

  /* =================================================================
     TOASTS (minimal local version — admin panel doesn't load app.js)
     ================================================================= */
  function showToast(message, icon = "ℹ️"){
    const container = document.getElementById("toastContainer");
    if(!container) return;
    while(container.children.length >= 3) container.firstElementChild.remove();
    const toast = document.createElement("div");
    toast.className = "toast glass-strong";
    toast.innerHTML = `<span aria-hidden="true">${icon}</span><span style="flex:1; font-size:0.88rem; font-weight:600; color:var(--parchment);">${escapeHTML(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add("leaving"); setTimeout(() => toast.remove(), 350); }, 2600);
  }
  function escapeHTML(str){
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function uid(prefix){ return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`; }

  /* =================================================================
     PIN LOGIN GATE
     ================================================================= */
  function getStoredPin(){ return storageGet(PIN_KEY) || DEFAULT_PIN; }
  function initLogin(){
    const loginScreen = document.getElementById("loginScreen");
    const adminShell = document.getElementById("adminShell");
    const pinInput = document.getElementById("pinInput");
    const emailInput = document.getElementById("emailInput");
    const passwordInput = document.getElementById("passwordInput");
    const loginBtn = document.getElementById("loginBtn");
    const loginError = document.getElementById("loginError");
    const logoutBtn = document.getElementById("logoutBtn");

    function showShell(){ loginScreen.classList.add("hidden"); adminShell.classList.remove("hidden"); renderAll(); }
    function showLogin(){ adminShell.classList.add("hidden"); loginScreen.classList.remove("hidden"); }

    if(window.OSDB && OSDB.isConfigured()){
      // ---- Supabase Auth (required so admin writes pass RLS) ----
      const pinField = document.getElementById("pinField");
      const authFields = document.getElementById("authFields");
      const subtitle = document.getElementById("loginSubtitle");
      if(pinField) pinField.classList.add("hidden");
      if(authFields) authFields.classList.remove("hidden");
      if(subtitle) subtitle.textContent = "سجّل دخولك للمتابعة";

      async function attemptAuth(){
        loginError.classList.add("hidden");
        try {
          await OSDB.signIn((emailInput.value || "").trim(), passwordInput.value || "");
          showShell();
        } catch(err){
          loginError.textContent = "بيانات الدخول غير صحيحة";
          loginError.classList.remove("hidden");
        }
      }
      loginBtn.addEventListener("click", attemptAuth);
      if(passwordInput) passwordInput.addEventListener("keydown", (e) => { if(e.key === "Enter") attemptAuth(); });

      // restore an existing session
      OSDB.getUser().then(u => { if(u) showShell(); }).catch(() => {});

      logoutBtn.addEventListener("click", async () => {
        try { await OSDB.signOut(); } catch(e){}
        showLogin();
        if(emailInput) emailInput.value = "";
        if(passwordInput) passwordInput.value = "";
      });
    } else {
      // ---- Local PIN gate (no Supabase configured) ----
      function attemptLogin(){
        if(pinInput.value === getStoredPin()){
          sessionStorage.setItem("oversauce_admin_session", "1");
          showShell();
        } else {
          loginError.classList.remove("hidden");
          pinInput.value = "";
          pinInput.focus();
        }
      }
      loginBtn.addEventListener("click", attemptLogin);
      pinInput.addEventListener("keydown", (e) => { if(e.key === "Enter") attemptLogin(); });

      if(sessionStorage.getItem("oversauce_admin_session") === "1") showShell();

      logoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("oversauce_admin_session");
        showLogin();
        pinInput.value = "";
      });
    }
  }

  /* =================================================================
     SIDEBAR NAVIGATION
     ================================================================= */
  function initNav(){
    document.querySelectorAll(".admin-nav-item[data-panel]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-nav-item[data-panel]").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`panel-${btn.getAttribute("data-panel")}`).classList.add("active");
      });
    });
  }

  /* =================================================================
     GENERIC MODAL HELPER
     ================================================================= */
  function openModal(title, bodyHTML, onMount){
    document.getElementById("adminModalTitle").textContent = title;
    document.getElementById("adminModalBody").innerHTML = bodyHTML;
    const scrim = document.getElementById("adminModalScrim");
    scrim.classList.remove("hidden");
    requestAnimationFrame(() => scrim.classList.add("active"));
    if(onMount) onMount();
  }
  function closeModal(){
    const scrim = document.getElementById("adminModalScrim");
    scrim.classList.remove("active");
    setTimeout(() => scrim.classList.add("hidden"), 300);
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("adminModalCloseBtn")?.addEventListener("click", closeModal);
    document.getElementById("adminModalScrim")?.addEventListener("click", (e) => {
      if(e.target.id === "adminModalScrim") closeModal();
    });
  });

  /* =================================================================
     IMAGE UPLOAD — converts a chosen file to a base64 data URL since
     there is no backend/server to store uploaded files. This is fine
     for small catalogs and previewing; for a large production catalog
     the agency implementing the backend should swap this for real
     object storage and just keep the same field name ("image").
     ================================================================= */
  function readFileAsDataURL(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* =================================================================
     CATEGORIES CRUD
     ================================================================= */
  function renderCategories(){
    const tbody = document.getElementById("categoriesTableBody");
    tbody.innerHTML = db.categories.sort((a,b) => a.order - b.order).map(cat => `
      <tr>
        <td style="font-size:1.3rem;">${cat.icon}</td>
        <td>${escapeHTML(cat.name.ar)}</td>
        <td>${escapeHTML(cat.name.en)}</td>
        <td>${cat.order}</td>
        <td class="admin-actions">
          <button class="btn btn-secondary btn-sm" data-edit-category="${cat.id}">تعديل</button>
          <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-delete-category="${cat.id}">حذف</button>
        </td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-edit-category]").forEach(b => b.addEventListener("click", () => openCategoryForm(b.getAttribute("data-edit-category"))));
    tbody.querySelectorAll("[data-delete-category]").forEach(b => b.addEventListener("click", () => deleteCategory(b.getAttribute("data-delete-category"))));
    populateCategoryFilter();
  }

  function openCategoryForm(categoryId){
    const cat = categoryId ? db.categories.find(c => c.id === categoryId) : null;
    openModal(cat ? "تعديل الفئة" : "إضافة فئة", `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div><label class="field-label">الأيقونة (إيموجي)</label><input id="catIcon" class="field" value="${cat ? cat.icon : '🍽️'}"></div>
        <div><label class="field-label">الاسم (عربي)</label><input id="catNameAr" class="field" value="${cat ? escapeHTML(cat.name.ar) : ''}"></div>
        <div><label class="field-label">الاسم (إنجليزي)</label><input id="catNameEn" class="field" value="${cat ? escapeHTML(cat.name.en) : ''}"></div>
        <div><label class="field-label">الترتيب</label><input id="catOrder" type="number" class="field" value="${cat ? cat.order : db.categories.length + 1}"></div>
        <button id="catSaveBtn" class="btn btn-primary">حفظ</button>
      </div>
    `, () => {
      document.getElementById("catSaveBtn").addEventListener("click", () => {
        const nameAr = document.getElementById("catNameAr").value.trim();
        const nameEn = document.getElementById("catNameEn").value.trim();
        if(!nameAr || !nameEn){ showToast("يرجى تعبئة جميع الحقول", "⚠️"); return; }
        const payload = {
          id: cat ? cat.id : uid("cat"),
          icon: document.getElementById("catIcon").value.trim() || "🍽️",
          name: { ar: nameAr, en: nameEn },
          order: Number(document.getElementById("catOrder").value) || 1
        };
        if(cat){
          Object.assign(cat, payload);
        } else {
          db.categories.push(payload);
        }
        saveDB(); renderCategories(); closeModal();
        showToast("تم حفظ الفئة بنجاح", "✅");
      });
    });
  }

  function deleteCategory(categoryId){
    const inUse = db.products.some(p => p.category === categoryId);
    if(inUse){
      showToast("لا يمكن حذف فئة تحتوي على أطباق — انقل الأطباق أولًا", "⚠️");
      return;
    }
    if(!confirm("هل أنت متأكد من حذف هذه الفئة؟")) return;
    db.categories = db.categories.filter(c => c.id !== categoryId);
    saveDB(); renderCategories();
    showToast("تم حذف الفئة", "🗑️");
  }

  function populateCategoryFilter(){
    const select = document.getElementById("productCategoryFilter");
    const current = select.value;
    select.innerHTML = `<option value="">كل الفئات</option>` + db.categories.map(c => `<option value="${c.id}">${escapeHTML(c.name.ar)}</option>`).join("");
    select.value = current;
  }

  /* =================================================================
     PRODUCTS CRUD
     ================================================================= */
  function renderProducts(){
    const tbody = document.getElementById("productsTableBody");
    const filter = document.getElementById("productCategoryFilter").value;
    const items = filter ? db.products.filter(p => p.category === filter) : db.products;

    tbody.innerHTML = items.map(p => {
      const cat = db.categories.find(c => c.id === p.category);
      return `
      <tr>
        <td><img src="${p.image}" alt="${escapeHTML(p.name.ar)}" loading="lazy"></td>
        <td>${escapeHTML(p.name.ar)}<br><span class="muted" style="font-size:0.75rem;">${escapeHTML(p.name.en)}</span></td>
        <td>${cat ? escapeHTML(cat.name.ar) : "—"}</td>
        <td>${p.price} ${p.oldPrice ? `<br><span class="muted" style="text-decoration:line-through; font-size:0.75rem;">${p.oldPrice}</span>` : ""}</td>
        <td>${p.inStock ? '<span style="color:var(--success);">متوفر</span>' : '<span style="color:var(--danger);">غير متوفر</span>'}</td>
        <td>${(p.badges||[]).join("، ") || "—"}</td>
        <td class="admin-actions">
          <button class="btn btn-secondary btn-sm" data-edit-product="${p.id}">تعديل</button>
          <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-delete-product="${p.id}">حذف</button>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-edit-product]").forEach(b => b.addEventListener("click", () => openProductForm(b.getAttribute("data-edit-product"))));
    tbody.querySelectorAll("[data-delete-product]").forEach(b => b.addEventListener("click", () => deleteProduct(b.getAttribute("data-delete-product"))));
  }

  function openProductForm(productId){
    const product = productId ? db.products.find(p => p.id === productId) : null;
    const categoryOptions = db.categories.map(c => `<option value="${c.id}" ${product && product.category === c.id ? "selected" : ""}>${escapeHTML(c.name.ar)}</option>`).join("");

    openModal(product ? "تعديل الطبق" : "إضافة طبق", `
      <div style="display:flex; flex-direction:column; gap:14px; max-height:60vh; overflow-y:auto; padding-inline-end:6px;">
        <div class="form-grid">
          <div><label class="field-label">الاسم (عربي)</label><input id="prodNameAr" class="field" value="${product ? escapeHTML(product.name.ar) : ''}"></div>
          <div><label class="field-label">الاسم (إنجليزي)</label><input id="prodNameEn" class="field" value="${product ? escapeHTML(product.name.en) : ''}"></div>
        </div>
        <div class="form-grid">
          <div><label class="field-label">الوصف (عربي)</label><textarea id="prodDescAr" class="field" rows="2">${product ? escapeHTML(product.description.ar) : ''}</textarea></div>
          <div><label class="field-label">الوصف (إنجليزي)</label><textarea id="prodDescEn" class="field" rows="2">${product ? escapeHTML(product.description.en) : ''}</textarea></div>
        </div>
        <div class="form-grid">
          <div><label class="field-label">السعر</label><input id="prodPrice" type="number" min="0" step="0.01" class="field" value="${product ? product.price : ''}"></div>
          <div><label class="field-label">السعر القديم (اختياري)</label><input id="prodOldPrice" type="number" min="0" step="0.01" class="field" value="${product && product.oldPrice ? product.oldPrice : ''}"></div>
        </div>
        <div><label class="field-label">الفئة</label><select id="prodCategory" class="field">${categoryOptions}</select></div>
        <div class="form-grid">
          <div><label class="field-label">السعرات الحرارية (اختياري)</label><input id="prodCalories" type="number" min="0" step="1" class="field" value="${product && product.calories != null ? product.calories : ''}" placeholder="مثال: 540"></div>
          <div><label class="field-label">مسببات الحساسية (افصل بفاصلة)</label><input id="prodAllergens" type="text" class="field" value="${product && product.allergens ? product.allergens.join('، ') : ''}" placeholder="جلوتين، ألبان، مكسرات"></div>
        </div>
        <div>
          <label class="field-label">صورة الطبق</label>
          <input id="prodImageFile" type="file" accept="image/*" class="field">
          <input id="prodImageUrl" type="text" class="field" placeholder="أو ألصق رابط صورة مباشر" value="${product ? product.image : ''}" style="margin-top:8px;">
          <img id="prodImagePreview" src="${product ? product.image : ''}" alt="" style="width:80px; height:80px; object-fit:cover; border-radius:10px; margin-top:8px; ${product ? '' : 'display:none;'}">
        </div>
        <div>
          <label class="field-label">الشارات</label>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <label class="badge-toggle"><input type="checkbox" id="badgeNew" ${product && product.badges?.includes('new') ? 'checked' : ''}> جديد</label>
            <label class="badge-toggle"><input type="checkbox" id="badgeBest" ${product && product.badges?.includes('best') ? 'checked' : ''}> الأكثر طلبًا</label>
            <label class="badge-toggle"><input type="checkbox" id="badgeSpicy" ${product && product.badges?.includes('spicy') ? 'checked' : ''}> حار</label>
          </div>
        </div>
        <label class="badge-toggle" style="width:fit-content;"><input type="checkbox" id="prodInStock" ${!product || product.inStock ? 'checked' : ''}> متوفر للطلب</label>
        <button id="prodSaveBtn" class="btn btn-primary">حفظ الطبق</button>
      </div>
    `, () => {
      document.getElementById("prodImageFile").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        let url;
        if(window.OSDB && OSDB.isConfigured()){
          try { url = await OSDB.uploadProductImage(file); }
          catch(err){ console.error(err); showToast("فشل رفع الصورة", "⚠️"); return; }
        } else {
          url = await readFileAsDataURL(file);
        }
        document.getElementById("prodImageUrl").value = url;
        const preview = document.getElementById("prodImagePreview");
        preview.src = url;
        preview.style.display = "block";
      });
      document.getElementById("prodImageUrl").addEventListener("input", (e) => {
        const preview = document.getElementById("prodImagePreview");
        preview.src = e.target.value;
        preview.style.display = e.target.value ? "block" : "none";
      });

      document.getElementById("prodSaveBtn").addEventListener("click", () => {
        const nameAr = document.getElementById("prodNameAr").value.trim();
        const nameEn = document.getElementById("prodNameEn").value.trim();
        const price = Number(document.getElementById("prodPrice").value);
        const image = document.getElementById("prodImageUrl").value.trim();

        if(!nameAr || !nameEn || !price || !image){
          showToast("يرجى تعبئة الاسم والسعر والصورة على الأقل", "⚠️");
          return;
        }

        const badges = [];
        if(document.getElementById("badgeNew").checked) badges.push("new");
        if(document.getElementById("badgeBest").checked) badges.push("best");
        if(document.getElementById("badgeSpicy").checked) badges.push("spicy");

        const oldPriceVal = Number(document.getElementById("prodOldPrice").value) || null;

        const payload = {
          id: product ? product.id : uid("prod"),
          category: document.getElementById("prodCategory").value,
          name: { ar: nameAr, en: nameEn },
          description: {
            ar: document.getElementById("prodDescAr").value.trim(),
            en: document.getElementById("prodDescEn").value.trim()
          },
          price,
          oldPrice: oldPriceVal && oldPriceVal > price ? oldPriceVal : null,
          image,
          badges,
          rating: product ? product.rating : 4.5,
          orders: product ? product.orders : 0,
          inStock: document.getElementById("prodInStock").checked,
          sizes: product ? product.sizes : [],
          extras: product ? product.extras : [],
          calories: Number(document.getElementById("prodCalories").value) || null,
          allergens: document.getElementById("prodAllergens").value.split(/[,،]/).map(s => s.trim()).filter(Boolean)
        };

        if(product){
          Object.assign(product, payload);
        } else {
          db.products.push(payload);
        }
        saveDB(); renderProducts(); renderDashboardStats(); closeModal();
        showToast("تم حفظ الطبق بنجاح", "✅");
      });
    });
  }

  function deleteProduct(productId){
    if(!confirm("هل أنت متأكد من حذف هذا الطبق؟")) return;
    db.products = db.products.filter(p => p.id !== productId);
    saveDB(); renderProducts(); renderDashboardStats();
    showToast("تم حذف الطبق", "🗑️");
  }

  /* =================================================================
     COUPONS CRUD
     ================================================================= */
  function renderCoupons(){
    const tbody = document.getElementById("couponsTableBody");
    tbody.innerHTML = db.coupons.map(c => `
      <tr>
        <td><strong>${escapeHTML(c.code)}</strong></td>
        <td>${c.type === "percentage" ? "نسبة %" : "قيمة ثابتة"}</td>
        <td>${c.type === "percentage" ? c.value + "%" : c.value}</td>
        <td>${c.minOrder}</td>
        <td>${c.active ? '<span style="color:var(--success);">نشط</span>' : '<span class="muted">متوقف</span>'}</td>
        <td class="admin-actions">
          <button class="btn btn-secondary btn-sm" data-edit-coupon="${c.code}">تعديل</button>
          <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-delete-coupon="${c.code}">حذف</button>
        </td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-edit-coupon]").forEach(b => b.addEventListener("click", () => openCouponForm(b.getAttribute("data-edit-coupon"))));
    tbody.querySelectorAll("[data-delete-coupon]").forEach(b => b.addEventListener("click", () => deleteCoupon(b.getAttribute("data-delete-coupon"))));
  }

  function openCouponForm(code){
    const coupon = code ? db.coupons.find(c => c.code === code) : null;
    openModal(coupon ? "تعديل الكوبون" : "إضافة كوبون", `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div><label class="field-label">الكود</label><input id="coupCode" class="field" style="text-transform:uppercase;" value="${coupon ? coupon.code : ''}" ${coupon ? 'disabled' : ''}></div>
        <div><label class="field-label">نوع الخصم</label>
          <select id="coupType" class="field">
            <option value="percentage" ${coupon && coupon.type === 'percentage' ? 'selected' : ''}>نسبة (%)</option>
            <option value="fixed" ${coupon && coupon.type === 'fixed' ? 'selected' : ''}>قيمة ثابتة</option>
          </select>
        </div>
        <div><label class="field-label">القيمة</label><input id="coupValue" type="number" min="0" class="field" value="${coupon ? coupon.value : ''}"></div>
        <div><label class="field-label">الحد الأدنى للطلب</label><input id="coupMin" type="number" min="0" class="field" value="${coupon ? coupon.minOrder : 0}"></div>
        <div><label class="field-label">الوصف (عربي)</label><input id="coupLabelAr" class="field" value="${coupon ? escapeHTML(coupon.label.ar) : ''}"></div>
        <div><label class="field-label">الوصف (إنجليزي)</label><input id="coupLabelEn" class="field" value="${coupon ? escapeHTML(coupon.label.en) : ''}"></div>
        <label class="badge-toggle" style="width:fit-content;"><input type="checkbox" id="coupActive" ${!coupon || coupon.active ? 'checked' : ''}> نشط</label>
        <button id="coupSaveBtn" class="btn btn-primary">حفظ الكوبون</button>
      </div>
    `, () => {
      document.getElementById("coupSaveBtn").addEventListener("click", () => {
        const codeVal = document.getElementById("coupCode").value.trim().toUpperCase();
        if(!codeVal){ showToast("يرجى إدخال كود الكوبون", "⚠️"); return; }
        if(!coupon && db.coupons.some(c => c.code === codeVal)){ showToast("هذا الكود مستخدم بالفعل", "⚠️"); return; }

        const payload = {
          code: codeVal,
          type: document.getElementById("coupType").value,
          value: Number(document.getElementById("coupValue").value) || 0,
          minOrder: Number(document.getElementById("coupMin").value) || 0,
          label: { ar: document.getElementById("coupLabelAr").value.trim(), en: document.getElementById("coupLabelEn").value.trim() },
          active: document.getElementById("coupActive").checked
        };
        if(coupon){
          Object.assign(coupon, payload);
        } else {
          db.coupons.push(payload);
        }
        saveDB(); renderCoupons(); renderDashboardStats(); closeModal();
        showToast("تم حفظ الكوبون بنجاح", "✅");
      });
    });
  }

  function deleteCoupon(code){
    if(!confirm("هل أنت متأكد من حذف هذا الكوبون؟")) return;
    db.coupons = db.coupons.filter(c => c.code !== code);
    saveDB(); renderCoupons(); renderDashboardStats();
    showToast("تم حذف الكوبون", "🗑️");
  }

  /* =================================================================
     FLASH DEALS (HOME BANNERS) CRUD
     ================================================================= */
  function renderDeals(){
    const tbody = document.getElementById("dealsTableBody");
    if(!tbody) return;
    tbody.innerHTML = db.flashDeals.map(d => `
      <tr>
        <td><strong>${escapeHTML(d.title.ar)}</strong></td>
        <td class="muted">${escapeHTML(d.subtitle ? d.subtitle.ar : "")}</td>
        <td>${d.discountPercent || 0}%</td>
        <td>${d.endsInHours || 0}</td>
        <td class="admin-actions">
          <button class="btn btn-secondary btn-sm" data-edit-deal="${d.id}">تعديل</button>
          <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-delete-deal="${d.id}">حذف</button>
        </td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-edit-deal]").forEach(b => b.addEventListener("click", () => openDealForm(b.getAttribute("data-edit-deal"))));
    tbody.querySelectorAll("[data-delete-deal]").forEach(b => b.addEventListener("click", () => deleteDeal(b.getAttribute("data-delete-deal"))));
  }

  function openDealForm(id){
    const deal = id ? db.flashDeals.find(d => d.id === id) : null;
    openModal(deal ? "تعديل العرض" : "إضافة عرض", `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div><label class="field-label">العنوان (عربي)</label><input id="dealTitleAr" class="field" value="${deal ? escapeHTML(deal.title.ar) : ''}"></div>
        <div><label class="field-label">العنوان (إنجليزي)</label><input id="dealTitleEn" class="field" value="${deal ? escapeHTML(deal.title.en) : ''}"></div>
        <div><label class="field-label">الوصف (عربي)</label><input id="dealSubAr" class="field" value="${deal && deal.subtitle ? escapeHTML(deal.subtitle.ar) : ''}"></div>
        <div><label class="field-label">الوصف (إنجليزي)</label><input id="dealSubEn" class="field" value="${deal && deal.subtitle ? escapeHTML(deal.subtitle.en) : ''}"></div>
        <div><label class="field-label">نسبة الخصم (%)</label><input id="dealDiscount" type="number" min="0" max="100" class="field" value="${deal ? (deal.discountPercent || 0) : 0}"></div>
        <div><label class="field-label">ينتهي خلال (ساعة)</label><input id="dealHours" type="number" min="0" class="field" value="${deal ? (deal.endsInHours || 24) : 24}"></div>
        <button id="dealSaveBtn" class="btn btn-primary">حفظ العرض</button>
      </div>
    `, () => {
      document.getElementById("dealSaveBtn").addEventListener("click", () => {
        const titleAr = document.getElementById("dealTitleAr").value.trim();
        const titleEn = document.getElementById("dealTitleEn").value.trim();
        if(!titleAr || !titleEn){ showToast("يرجى إدخال عنوان العرض بالعربي والإنجليزي", "⚠️"); return; }
        const payload = {
          id: deal ? deal.id : uid("deal"),
          title: { ar: titleAr, en: titleEn },
          subtitle: { ar: document.getElementById("dealSubAr").value.trim(), en: document.getElementById("dealSubEn").value.trim() },
          discountPercent: Number(document.getElementById("dealDiscount").value) || 0,
          endsInHours: Number(document.getElementById("dealHours").value) || 24,
          active: true
        };
        if(deal){ Object.assign(deal, payload); } else { db.flashDeals.push(payload); }
        saveDB(); renderDeals(); closeModal();
        showToast("تم حفظ العرض بنجاح", "✅");
      });
    });
  }

  function deleteDeal(id){
    if(!confirm("هل أنت متأكد من حذف هذا العرض؟")) return;
    db.flashDeals = db.flashDeals.filter(d => d.id !== id);
    saveDB(); renderDeals();
    showToast("تم حذف العرض", "🗑️");
  }

  /* =================================================================
     DELIVERY ZONES CRUD
     ================================================================= */
  function renderZones(){
    document.getElementById("minimumOrderInput").value = db.minimumOrder;
    const tbody = document.getElementById("zonesTableBody");
    tbody.innerHTML = db.deliveryZones.map(z => `
      <tr>
        <td>${escapeHTML(z.name.ar)}</td>
        <td>${escapeHTML(z.name.en)}</td>
        <td>${z.fee}</td>
        <td>${z.etaMinutes}</td>
        <td class="admin-actions">
          <button class="btn btn-secondary btn-sm" data-edit-zone="${z.id}">تعديل</button>
          <button class="btn btn-sm" style="background:var(--danger); color:#fff;" data-delete-zone="${z.id}">حذف</button>
        </td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-edit-zone]").forEach(b => b.addEventListener("click", () => openZoneForm(b.getAttribute("data-edit-zone"))));
    tbody.querySelectorAll("[data-delete-zone]").forEach(b => b.addEventListener("click", () => deleteZone(b.getAttribute("data-delete-zone"))));
  }

  function openZoneForm(zoneId){
    const zone = zoneId ? db.deliveryZones.find(z => z.id === zoneId) : null;
    openModal(zone ? "تعديل المنطقة" : "إضافة منطقة", `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div><label class="field-label">الاسم (عربي)</label><input id="zoneNameAr" class="field" value="${zone ? escapeHTML(zone.name.ar) : ''}"></div>
        <div><label class="field-label">الاسم (إنجليزي)</label><input id="zoneNameEn" class="field" value="${zone ? escapeHTML(zone.name.en) : ''}"></div>
        <div><label class="field-label">رسوم التوصيل</label><input id="zoneFee" type="number" min="0" class="field" value="${zone ? zone.fee : ''}"></div>
        <div><label class="field-label">الوقت التقديري (دقيقة)</label><input id="zoneEta" type="number" min="0" class="field" value="${zone ? zone.etaMinutes : ''}"></div>
        <button id="zoneSaveBtn" class="btn btn-primary">حفظ المنطقة</button>
      </div>
    `, () => {
      document.getElementById("zoneSaveBtn").addEventListener("click", () => {
        const nameAr = document.getElementById("zoneNameAr").value.trim();
        const nameEn = document.getElementById("zoneNameEn").value.trim();
        if(!nameAr || !nameEn){ showToast("يرجى تعبئة جميع الحقول", "⚠️"); return; }
        const payload = {
          id: zone ? zone.id : uid("zone"),
          name: { ar: nameAr, en: nameEn },
          fee: Number(document.getElementById("zoneFee").value) || 0,
          etaMinutes: Number(document.getElementById("zoneEta").value) || 30
        };
        if(zone){ Object.assign(zone, payload); } else { db.deliveryZones.push(payload); }
        saveDB(); renderZones(); closeModal();
        showToast("تم حفظ المنطقة بنجاح", "✅");
      });
    });
  }

  function deleteZone(zoneId){
    if(!confirm("هل أنت متأكد من حذف هذه المنطقة؟")) return;
    db.deliveryZones = db.deliveryZones.filter(z => z.id !== zoneId);
    saveDB(); renderZones();
    showToast("تم حذف المنطقة", "🗑️");
  }

  /* =================================================================
     SETTINGS
     ================================================================= */
  function renderSettings(){
    if(!db.restaurant) return;
    document.getElementById("settingNameAr").value = db.restaurant.name.ar;
    document.getElementById("settingNameEn").value = db.restaurant.name.en;
    document.getElementById("settingWhatsapp").value = db.restaurant.whatsapp;
    document.getElementById("settingPhone").value = db.restaurant.phone;
    document.getElementById("settingAddressAr").value = db.restaurant.address.ar;
    document.getElementById("settingHoursAr").value = db.restaurant.openingHours.ar;
    document.getElementById("settingMaps").value = db.restaurant.mapsUrl;
    document.getElementById("settingInstagram").value = db.restaurant.social.instagram;
    document.getElementById("settingAddressEn").value = db.restaurant.address.en || "";
    document.getElementById("settingHoursEn").value = db.restaurant.openingHours.en || "";
    document.getElementById("settingSnapchat").value = db.restaurant.social.snapchat || "";
    document.getElementById("settingFacebook").value = db.restaurant.social.facebook || "";
    document.getElementById("settingTiktok").value = db.restaurant.social.tiktok || "";
    document.getElementById("settingTaglineAr").value = (db.restaurant.tagline && db.restaurant.tagline.ar) || "";
    document.getElementById("settingTaglineEn").value = (db.restaurant.tagline && db.restaurant.tagline.en) || "";
    if(db.restaurant.stats){
      document.getElementById("settingYears").value = db.restaurant.stats.yearsOfExperience;
      document.getElementById("settingCustomers").value = db.restaurant.stats.happyCustomers;
      document.getElementById("settingMenuItems").value = db.restaurant.stats.menuItems;
    }
    document.getElementById("settingPin").value = getStoredPin();
  }

  function initSettingsSave(){
    document.getElementById("saveSettingsBtn").addEventListener("click", () => {
      const whatsappDigits = document.getElementById("settingWhatsapp").value.replace(/\D/g, "");
      if(whatsappDigits.length < 8){
        showToast("يرجى إدخال رقم واتساب صحيح (أرقام فقط، مع رمز الدولة)", "⚠️");
        return;
      }
      db.restaurant.name.ar = document.getElementById("settingNameAr").value.trim();
      db.restaurant.name.en = document.getElementById("settingNameEn").value.trim();
      db.restaurant.whatsapp = whatsappDigits;
      db.restaurant.phone = document.getElementById("settingPhone").value.trim();
      db.restaurant.address.ar = document.getElementById("settingAddressAr").value.trim();
      db.restaurant.openingHours.ar = document.getElementById("settingHoursAr").value.trim();
      db.restaurant.mapsUrl = document.getElementById("settingMaps").value.trim();
      db.restaurant.social.instagram = document.getElementById("settingInstagram").value.trim();
      db.restaurant.address.en = document.getElementById("settingAddressEn").value.trim();
      db.restaurant.openingHours.en = document.getElementById("settingHoursEn").value.trim();
      db.restaurant.social.snapchat = document.getElementById("settingSnapchat").value.trim();
      db.restaurant.social.facebook = document.getElementById("settingFacebook").value.trim();
      db.restaurant.social.tiktok = document.getElementById("settingTiktok").value.trim();
      if(!db.restaurant.tagline) db.restaurant.tagline = {};
      db.restaurant.tagline.ar = document.getElementById("settingTaglineAr").value.trim();
      db.restaurant.tagline.en = document.getElementById("settingTaglineEn").value.trim();
      if(!db.restaurant.stats) db.restaurant.stats = {};
      db.restaurant.stats.yearsOfExperience = Number(document.getElementById("settingYears").value) || 0;
      db.restaurant.stats.happyCustomers = Number(document.getElementById("settingCustomers").value) || 0;
      db.restaurant.stats.menuItems = Number(document.getElementById("settingMenuItems").value) || 0;

      const newPin = document.getElementById("settingPin").value.trim();
      if(newPin && newPin.length >= 4){
        storageSet(PIN_KEY, newPin);
      }

      saveDB();
      showToast("تم حفظ الإعدادات بنجاح", "✅");
    });
  }

  /* =================================================================
     DASHBOARD STATS
     ================================================================= */
  function renderDashboardStats(){
    document.getElementById("statCatCount").textContent = db.categories.length;
    document.getElementById("statProductCount").textContent = db.products.length;
    document.getElementById("statOutOfStockCount").textContent = db.products.filter(p => !p.inStock).length;
    document.getElementById("statCouponCount").textContent = db.coupons.filter(c => c.active).length;

    const totalOrders = db.products.reduce((s, p) => s + (p.orders || 0), 0);
    const totalEl = document.getElementById("statTotalOrders");
    if(totalEl) totalEl.textContent = totalOrders.toLocaleString("en");
    const avg = db.products.length ? Math.round(db.products.reduce((s, p) => s + (p.price || 0), 0) / db.products.length) : 0;
    const avgEl = document.getElementById("statAvgPrice");
    if(avgEl) avgEl.textContent = avg;

    const list = document.getElementById("topProductsList");
    if(list){
      const top = [...db.products].sort((a, b) => (b.orders || 0) - (a.orders || 0)).slice(0, 5);
      list.innerHTML = top.length
        ? top.map(p => `<li>${escapeHTML(p.name.ar)} <span class="muted" style="font-size:0.82rem;">— ${(p.orders || 0)} طلب</span></li>`).join("")
        : '<li class="muted">لا توجد بيانات بعد</li>';
    }

    const toggle = document.getElementById("ordersPausedToggle");
    const hint = document.getElementById("ordersStatusHint");
    if(toggle && db.restaurant){
      toggle.checked = !!db.restaurant.ordersPaused;
      if(hint) hint.textContent = db.restaurant.ordersPaused ? "⛔ الطلبات متوقفة حاليًا" : "✅ الطلبات تعمل بشكل طبيعي";
    }
  }

  /* =================================================================
     IMPORT / EXPORT
     ================================================================= */
  function downloadJSON(filename, data){
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function initExport(){
    document.querySelectorAll("[data-export]").forEach(btn => {
      btn.addEventListener("click", () => {
        const kind = btn.getAttribute("data-export");
        if(kind === "categories") downloadJSON("categories.json", { categories: db.categories });
        else if(kind === "products") downloadJSON("products.json", { products: db.products });
        else if(kind === "coupons") downloadJSON("coupons.json", { coupons: db.coupons, flashDeals: db.flashDeals });
        else if(kind === "zones") downloadJSON("delivery-zones.json", { deliveryZones: db.deliveryZones, minimumOrder: db.minimumOrder, restaurant: db.restaurant });
        else if(kind === "all") downloadJSON("oversauce-backup.json", db);
        showToast("تم تنزيل الملف", "📦");
      });
    });
  }

  function initImport(){
    document.getElementById("importFileInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      const statusEl = document.getElementById("importStatus");
      if(!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        // Accept either a full backup (has .products/.categories/.deliveryZones)
        // or partial files merged individually, for flexibility.
        if(parsed.categories) db.categories = parsed.categories;
        if(parsed.products) db.products = parsed.products;
        if(parsed.coupons) db.coupons = parsed.coupons;
        if(parsed.flashDeals) db.flashDeals = parsed.flashDeals;
        if(parsed.deliveryZones) db.deliveryZones = parsed.deliveryZones;
        if(parsed.minimumOrder != null) db.minimumOrder = parsed.minimumOrder;
        if(parsed.restaurant) db.restaurant = parsed.restaurant;

        saveDB();
        renderAll();
        statusEl.textContent = "تم الاستيراد بنجاح ✅";
        statusEl.style.color = "var(--success)";
        showToast("تم استيراد البيانات بنجاح", "✅");
      } catch(err){
        statusEl.textContent = "فشل الاستيراد — تأكد من أن الملف بصيغة JSON صحيحة";
        statusEl.style.color = "#E0594A";
        showToast("فشل استيراد الملف", "⚠️");
      }
    });
  }

  /* =================================================================
     INIT
     ================================================================= */
  function renderAll(){
    renderCategories();
    renderProducts();
    renderCoupons();
    renderDeals();
    renderZones();
    renderSettings();
    renderDashboardStats();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initNav();
    initExport();
    initImport();
    initSettingsSave();

    await loadDB();
    initLogin();

    document.getElementById("addCategoryBtn").addEventListener("click", () => openCategoryForm(null));
    document.getElementById("addProductBtn").addEventListener("click", () => openProductForm(null));
    document.getElementById("addCouponBtn").addEventListener("click", () => openCouponForm(null));
    document.getElementById("addDealBtn")?.addEventListener("click", () => openDealForm(null));
    document.getElementById("addZoneBtn").addEventListener("click", () => openZoneForm(null));
    document.getElementById("productCategoryFilter").addEventListener("change", renderProducts);
    document.getElementById("minimumOrderInput").addEventListener("change", (e) => {
      db.minimumOrder = Number(e.target.value) || 0;
      saveDB();
      showToast("تم تحديث الحد الأدنى للطلب", "✅");
    });

    const ordersToggle = document.getElementById("ordersPausedToggle");
    if(ordersToggle){
      ordersToggle.addEventListener("change", () => {
        if(!db.restaurant) return;
        db.restaurant.ordersPaused = ordersToggle.checked;
        const hint = document.getElementById("ordersStatusHint");
        if(hint) hint.textContent = ordersToggle.checked ? "⛔ الطلبات متوقفة حاليًا" : "✅ الطلبات تعمل بشكل طبيعي";
        saveDB();
        showToast(ordersToggle.checked ? "تم إيقاف استقبال الطلبات" : "تم تشغيل استقبال الطلبات", ordersToggle.checked ? "⛔" : "✅");
      });
    }
  });
})();
