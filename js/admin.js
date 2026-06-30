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
      // نُعيد الوعد (promise) ليتمكّن المستدعي من انتظار نجاح الحفظ فعليًا
      // قبل عرض رسالة النجاح، بدل افتراض النجاح فورًا.
      return OSDB.syncAll(db).catch((e) => {
        console.error("[admin] sync failed", e);
        showToast("فشل الحفظ في قاعدة البيانات — تأكد من تسجيل دخولك", "⚠️");
        throw e;
      });
    }
    storageSet(STORAGE_KEY, JSON.stringify(db));
    return Promise.resolve();
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

    function showShell(){ loginScreen.classList.add("hidden"); adminShell.classList.remove("hidden"); renderAll(); bootstrapPermissions(); }
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
    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape" && !document.getElementById("adminModalScrim")?.classList.contains("hidden")) closeModal();
    });
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

  // ضغط الصورة في المتصفح قبل الرفع: نرسمها على canvas بحدّ أقصى للعرض،
  // ثم نُصدّرها JPEG. يُرجع File جاهزًا للرفع. لو الملف ليس صورة نقطية
  // (مثل SVG/GIF) أو فشلت العملية، نُعيد الأصلية كما هي.
  function compressImage(file, maxWidth, quality){
    return new Promise((resolve, reject) => {
      if(!/^image\/(jpe?g|png|webp)$/i.test(file.type || "")){
        resolve(file); return; // نوع لا يُضغط بأمان → اتركه
      }
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          try {
            const scale = Math.min(1, maxWidth / img.width);
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              if(!blob){ resolve(file); return; }
              // لو الضغط لم يُصغّر الحجم فعليًا، نُبقي الأصلية
              if(blob.size >= file.size){ resolve(file); return; }
              const out = new File([blob], (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
              resolve(out);
            }, "image/jpeg", quality);
          } catch(e){ resolve(file); }
        };
        img.src = reader.result;
      };
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

        <div>
          <label class="field-label">الأحجام / الخيارات (اختياري — مثل: براد، كوب)</label>
          <p class="muted" style="font-size:0.78rem; margin-bottom:8px;">لو الطبق له أحجام أو خيارات يختار منها العميل (براد/كوب، صغير/كبير). فرق السعر يُضاف للسعر الأساسي — اتركه صفرًا لو نفس السعر.</p>
          <div id="prodSizesList" style="display:flex; flex-direction:column; gap:8px;"></div>
          <button type="button" id="prodAddSizeBtn" class="btn btn-ghost btn-sm" style="margin-top:8px;">+ إضافة خيار</button>
        </div>

        <div>
          <label class="field-label">الإضافات (اختياري — مثل: جبنة زيادة، صوص)</label>
          <p class="muted" style="font-size:0.78rem; margin-bottom:8px;">إضافات يقدر العميل يختار أكثر من واحدة معًا. سعر كل إضافة يُضاف للإجمالي.</p>
          <div id="prodExtrasList" style="display:flex; flex-direction:column; gap:8px;"></div>
          <button type="button" id="prodAddExtraBtn" class="btn btn-ghost btn-sm" style="margin-top:8px;">+ إضافة صنف إضافي</button>
        </div>

        <button id="prodSaveBtn" class="btn btn-primary">حفظ الطبق</button>
      </div>
    `, () => {
      // ---- إدارة الأحجام/الخيارات (براد/كوب، صغير/كبير...) ----
      // كل صف: اسم عربي + اسم إنجليزي + فرق السعر، مع زر حذف.
      const sizesList = document.getElementById("prodSizesList");
      function addSizeRow(size){
        const row = document.createElement("div");
        row.className = "prod-size-row";
        row.style.cssText = "display:flex; gap:8px; align-items:center; flex-wrap:wrap;";
        row.innerHTML = `
          <input class="field size-ar" placeholder="الاسم (عربي) — مثل: براد" style="flex:1; min-width:120px;" value="${size ? escapeHTML(size.name?.ar || "") : ""}">
          <input class="field size-en" placeholder="English — e.g. Pot" style="flex:1; min-width:100px;" value="${size ? escapeHTML(size.name?.en || "") : ""}">
          <input class="field size-diff" type="number" step="0.01" placeholder="فرق السعر" style="width:110px;" value="${size && size.priceDiff != null ? size.priceDiff : 0}">
          <button type="button" class="btn btn-ghost btn-sm size-del" title="حذف الخيار" aria-label="حذف الخيار">✕</button>
        `;
        row.querySelector(".size-del").addEventListener("click", () => row.remove());
        sizesList.appendChild(row);
      }
      // تعبئة الخيارات الموجودة عند التعديل
      if(product && Array.isArray(product.sizes)){
        product.sizes.forEach(s => addSizeRow(s));
      }
      document.getElementById("prodAddSizeBtn").addEventListener("click", () => addSizeRow(null));

      // ---- إدارة الإضافات (جبنة زيادة، صوص...) — العميل يختار أكثر من واحدة ----
      const extrasList = document.getElementById("prodExtrasList");
      function addExtraRow(extra){
        const row = document.createElement("div");
        row.className = "prod-extra-row";
        row.style.cssText = "display:flex; gap:8px; align-items:center; flex-wrap:wrap;";
        row.innerHTML = `
          <input class="field extra-ar" placeholder="الاسم (عربي) — مثل: جبنة زيادة" style="flex:1; min-width:120px;" value="${extra ? escapeHTML(extra.name?.ar || "") : ""}">
          <input class="field extra-en" placeholder="English — e.g. Extra cheese" style="flex:1; min-width:100px;" value="${extra ? escapeHTML(extra.name?.en || "") : ""}">
          <input class="field extra-price" type="number" min="0" step="0.01" placeholder="السعر" style="width:110px;" value="${extra && extra.price != null ? extra.price : 0}">
          <button type="button" class="btn btn-ghost btn-sm extra-del" title="حذف الإضافة" aria-label="حذف الإضافة">✕</button>
        `;
        row.querySelector(".extra-del").addEventListener("click", () => row.remove());
        extrasList.appendChild(row);
      }
      if(product && Array.isArray(product.extras)){
        product.extras.forEach(ex => addExtraRow(ex));
      }
      document.getElementById("prodAddExtraBtn").addEventListener("click", () => addExtraRow(null));

      document.getElementById("prodImageFile").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        let url;
        // نضغط الصورة في المتصفح قبل الرفع: نقلّل العرض الأقصى ونحوّلها JPEG.
        // هذا يحوّل صورة موبايل من ~6 ميجا إلى أقل من نصف ميجا غالبًا، فيُسرّع
        // تحميل الموقع لكل العملاء، ويتجنّب رفض الرفع لتجاوز حد الـ 5 ميجا.
        let toUpload = file;
        try {
          showToast("جارٍ معالجة الصورة...", "🖼️");
          toUpload = await compressImage(file, 1400, 0.82);
        } catch(err){
          toUpload = file; // لو فشل الضغط لأي سبب، نرفع الأصلية (مع حد الـ 5 ميجا)
        }
        if(window.OSDB && OSDB.isConfigured()){
          try { url = await OSDB.uploadProductImage(toUpload); }
          catch(err){ console.error(err); showToast(err.message || "فشل رفع الصورة", "⚠️"); return; }
        } else {
          url = await readFileAsDataURL(toUpload);
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

      document.getElementById("prodSaveBtn").addEventListener("click", async () => {
        const saveBtn = document.getElementById("prodSaveBtn");
        const nameAr = document.getElementById("prodNameAr").value.trim();
        const nameEn = document.getElementById("prodNameEn").value.trim();
        const price = Number(document.getElementById("prodPrice").value);
        const image = document.getElementById("prodImageUrl").value.trim();

        // الاسم العربي والسعر والصورة إلزامية فقط — الاسم الإنجليزي اختياري
        // (صاحب المطعم يكتب بالعربي، فلا نُجبره على ترجمة كل صنف).
        if(!nameAr || !price || !image){
          showToast("يرجى تعبئة الاسم العربي والسعر والصورة", "⚠️");
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
          name: { ar: nameAr, en: nameEn || nameAr },
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
          sizes: (function(){
            // نجمع صفوف الأحجام من الواجهة؛ نتجاهل أي صف بلا اسم عربي.
            return Array.from(document.querySelectorAll("#prodSizesList .prod-size-row")).map((row, i) => {
              const ar = row.querySelector(".size-ar").value.trim();
              const en = row.querySelector(".size-en").value.trim();
              const diff = Number(row.querySelector(".size-diff").value) || 0;
              if(!ar) return null;
              return { id: "s" + (i + 1), name: { ar, en: en || ar }, priceDiff: diff };
            }).filter(Boolean);
          })(),
          extras: (function(){
            // نجمع صفوف الإضافات من الواجهة؛ نتجاهل أي صف بلا اسم عربي.
            return Array.from(document.querySelectorAll("#prodExtrasList .prod-extra-row")).map((row, i) => {
              const ar = row.querySelector(".extra-ar").value.trim();
              const en = row.querySelector(".extra-en").value.trim();
              const price = Math.max(0, Number(row.querySelector(".extra-price").value) || 0);
              if(!ar) return null;
              return { id: "e" + (i + 1), name: { ar, en: en || ar }, price };
            }).filter(Boolean);
          })(),
          calories: Number(document.getElementById("prodCalories").value) || null,
          allergens: document.getElementById("prodAllergens").value.split(/[,،]/).map(s => s.trim()).filter(Boolean)
        };

        if(product){
          Object.assign(product, payload);
        } else {
          db.products.push(payload);
        }
        // تعطيل الزر أثناء الحفظ (يمنع الضغط المزدوج وإنشاء نسخ مكررة)،
        // وإظهار النجاح فقط بعد تأكيد الحفظ في قاعدة البيانات فعليًا.
        saveBtn.disabled = true;
        saveBtn.textContent = "جارٍ الحفظ...";
        try {
          await saveDB();
          renderProducts(); renderDashboardStats(); closeModal();
          showToast("تم حفظ الطبق بنجاح", "✅");
        } catch(e){
          // فشل الحفظ — نُبقي النافذة مفتوحة ليُعيد المحاولة دون فقدان إدخاله
          if(!product) db.products.pop(); // تراجع عن الإضافة المتفائلة
          saveBtn.disabled = false;
          saveBtn.textContent = "حفظ الطبق";
        }
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
    document.getElementById("settingVatNumber").value = db.restaurant.vatNumber || "";
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
      db.restaurant.vatNumber = document.getElementById("settingVatNumber").value.replace(/\s/g, "").trim();
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

    // ---- إحصائيات اليوم من الطلبات الفعلية (لا من أرقام ثابتة) ----
    // نحسب الطلبات التي أُنشئت اليوم وإجمالي إيراداتها، ونتجاهل الملغاة.
    const todayOrdersEl = document.getElementById("statTodayOrders");
    const todayRevenueEl = document.getElementById("statTodayRevenue");
    if(todayOrdersEl || todayRevenueEl){
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      let todayCount = 0, todayRevenue = 0;
      (orders || []).forEach(o => {
        if(!o.createdAt) return;
        const t = new Date(o.createdAt).getTime();
        if(isNaN(t) || t < startOfDay) return;
        if(o.status === "cancelled") return; // لا نحسب الملغاة في الإيراد
        todayCount++;
        todayRevenue += Number(o.grandTotal) || 0;
      });
      if(todayOrdersEl) todayOrdersEl.textContent = todayCount.toLocaleString("en");
      if(todayRevenueEl) todayRevenueEl.textContent = money(todayRevenue);
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
  /* =================================================================
     FEATURE FLAGS
     ================================================================= */
  const FEATURE_FLAGS = [
    { key: "coupons",          ar: "كوبونات الخصم",          def: true },
    { key: "offers",           ar: "العروض (الفلاش)",        def: true },
    { key: "reviews",          ar: "تقييمات العملاء",         def: true },
    { key: "delivery",         ar: "خدمة التوصيل",            def: true },
    { key: "darkMode",         ar: "الوضع الليلي",            def: true },
    { key: "whatsappOrdering", ar: "الطلب عبر واتساب",        def: true },
    { key: "gallery",          ar: "معرض الصور (قريبًا)",      def: false },
    { key: "loyalty",          ar: "برنامج الولاء (قريبًا)",   def: false },
    { key: "notifications",    ar: "الإشعارات (قريبًا)",       def: false },
    { key: "onlinePayments",   ar: "الدفع الأونلاين (قريبًا)", def: false }
  ];

  function renderFeatures(){
    const wrap = document.getElementById("featureFlagsList");
    if(!wrap) return;
    if(!db.restaurant) db.restaurant = {};
    if(!db.restaurant.features) db.restaurant.features = {};
    const f = db.restaurant.features;
    wrap.innerHTML = FEATURE_FLAGS.map(flag => {
      const on = (f[flag.key] !== undefined) ? f[flag.key] : flag.def;
      return `<label class="feature-row">
        <strong>${flag.ar}</strong>
        <span class="switch"><input type="checkbox" data-feature="${flag.key}" ${on ? "checked" : ""}><span class="switch-slider"></span></span>
      </label>`;
    }).join("");
    wrap.querySelectorAll("input[data-feature]").forEach(inp => {
      inp.addEventListener("change", () => {
        db.restaurant.features[inp.getAttribute("data-feature")] = inp.checked;
        saveDB();
        showToast(inp.checked ? "تم تفعيل الميزة" : "تم إيقاف الميزة", inp.checked ? "✅" : "🚫");
      });
    });
  }

  function renderAll(){
    renderCategories();
    renderProducts();
    renderCoupons();
    renderDeals();
    renderZones();
    renderSettings();
    renderDashboardStats();
    renderOrders();
    renderFeatures();
    // نحمّل الطلبات الفعلية في الخلفية حتى تظهر أرقام اليوم في لوحة
    // المعلومات فور الدخول، دون انتظار فتح قسم الطلبات. loadOrders
    // تستدعي renderDashboardStats تلقائيًا عند وصول البيانات.
    loadOrders();
  }

  /* =================================================================
     ORDERS MANAGEMENT
     ================================================================= */
  let orders = [];
  let _prevOrderCount = 0;
  let _ordersSubscribed = false;
  let _staffName = "المدير";
  const orderFilters = { search: "", status: "", payment: "", sort: "newest", from: "", to: "" };

  const ORDER_STATUSES = [
    { id: "pending",          ar: "قيد الانتظار", icon: "🕒" },
    { id: "confirmed",        ar: "مؤكد",         icon: "✅" },
    { id: "preparing",        ar: "قيد التحضير",  icon: "👨‍🍳" },
    { id: "ready",            ar: "جاهز",         icon: "📦" },
    { id: "served",           ar: "تم التقديم",   icon: "🍽️" },
    { id: "out_for_delivery", ar: "خرج للتوصيل",  icon: "🛵" },
    { id: "delivered",        ar: "تم التسليم",    icon: "🎉" },
    { id: "completed",        ar: "مكتمل",        icon: "✔️" },
    { id: "cancelled",        ar: "ملغي",         icon: "❌" }
  ];
  const PAY_LABELS = { cash: "نقدًا", mada: "مدى", applepay: "Apple Pay", stcpay: "STC Pay", card: "بطاقة" };
  function statusInfo(id){ return ORDER_STATUSES.find(s => s.id === id) || ORDER_STATUSES[0]; }
  function currentStaffName(){ return _staffName; }
  function debounceAdmin(fn, wait){
    let t; return function(){ clearTimeout(t); const a = arguments, c = this; t = setTimeout(() => fn.apply(c, a), wait); };
  }
  function money(n){ return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ر.س"; }
  function fmtDate(iso){
    if(!iso) return "—";
    const d = new Date(iso);
    if(isNaN(d)) return "—";
    return d.toLocaleDateString("ar-EG") + " " + d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  }

  async function loadOrders(){
    if(window.OSDB && OSDB.isConfigured()){
      try { orders = await OSDB.fetchOrders(); }
      catch(e){ orders = []; }
    } else {
      orders = [];
    }
    // بعد وصول الطلبات الفعلية، نُحدّث أرقام اليوم في لوحة المعلومات.
    renderDashboardStats();
  }

  function filteredOrders(){
    let list = orders.slice();
    const f = orderFilters;
    if(f.status)  list = list.filter(o => o.status === f.status);
    if(f.payment) list = list.filter(o => o.paymentMethod === f.payment);
    if(f.from)    list = list.filter(o => (o.createdAt || "").slice(0, 10) >= f.from);
    if(f.to)      list = list.filter(o => (o.createdAt || "").slice(0, 10) <= f.to);
    if(f.search){
      const q = f.search.trim().toLowerCase();
      list = list.filter(o => {
        const items = (o.items || []).map(it => ((it.name && it.name.ar) || "") + " " + ((it.name && it.name.en) || "")).join(" ");
        return [o.orderNumber, o.customerName, o.phone, items].join(" ").toLowerCase().includes(q);
      });
    }
    switch(f.sort){
      case "oldest": list.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")); break;
      case "high":   list.sort((a, b) => b.grandTotal - a.grandTotal); break;
      case "low":    list.sort((a, b) => a.grandTotal - b.grandTotal); break;
      default:       list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    }
    return list;
  }

  function renderOrderStats(){
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    let today = 0, week = 0, month = 0, pending = 0, revenue = 0;
    orders.forEach(o => {
      const d = (o.createdAt || "").slice(0, 10);
      if(d === todayStr) today++;
      if(d >= weekAgo) week++;
      if((o.createdAt || "").slice(0, 7) === monthStr) month++;
      if(o.status === "pending") pending++;
      if(o.status !== "cancelled") revenue += Number(o.grandTotal) || 0;
    });
    const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    set("ordStatToday", today); set("ordStatWeek", week); set("ordStatMonth", month);
    set("ordStatPending", pending); set("ordStatRevenue", money(revenue));
  }

  function renderOrders(){
    renderOrderStats();
    const tbody = document.getElementById("ordersTableBody");
    if(!tbody) return;
    const list = filteredOrders();
    const hint = document.getElementById("ordersEmptyHint");
    if(!list.length){
      tbody.innerHTML = "";
      if(hint){
        hint.textContent = orders.length
          ? "لا توجد طلبات مطابقة للبحث أو الفلترة."
          : ((window.OSDB && OSDB.isConfigured())
              ? "لا توجد طلبات بعد — ستظهر هنا فور استلام أول طلب."
              : "اتصل بـ Supabase لاستقبال الطلبات وتخزينها.");
      }
      return;
    }
    if(hint) hint.textContent = "";
    tbody.innerHTML = list.map(o => {
      const s = statusInfo(o.status);
      return `<tr>
        <td><strong>${escapeHTML(o.orderNumber || "—")}</strong></td>
        <td>${escapeHTML(o.customerName || "—")}</td>
        <td dir="ltr" style="text-align:right;">${escapeHTML(o.phone || "—")}</td>
        <td>${o.orderType === "delivery" ? "توصيل" : "استلام"}</td>
        <td style="white-space:nowrap;">${money(o.grandTotal)}</td>
        <td>${PAY_LABELS[o.paymentMethod] || escapeHTML(o.paymentMethod)}</td>
        <td><span class="order-status-badge status-${o.status}">${s.icon} ${s.ar}</span></td>
        <td style="font-size:0.78rem; white-space:nowrap;">${fmtDate(o.createdAt)}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-xs" data-view-order="${o.id}">عرض</button>
          <button class="btn btn-ghost btn-xs" data-del-order="${o.id}" style="color:#E0594A;">حذف</button>
        </td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll("[data-view-order]").forEach(b => b.addEventListener("click", () => openOrderDetails(b.getAttribute("data-view-order"))));
    tbody.querySelectorAll("[data-del-order]").forEach(b => b.addEventListener("click", () => deleteOrderRow(b.getAttribute("data-del-order"))));
  }

  function openOrderDetails(id){
    const o = orders.find(x => x.id === id);
    if(!o) return;
    const s = statusInfo(o.status);

    const itemsHTML = (o.items || []).map(it => {
      const extras = (it.extras || []).map(e => e.ar || e.en).filter(Boolean).join("، ");
      return `<div style="padding:8px 0; border-bottom:1px solid var(--line);">
        <div class="flex" style="justify-content:space-between; gap:10px;">
          <span><strong>${escapeHTML((it.name && it.name.ar) || "")}</strong> × ${it.qty}</span>
          <span style="white-space:nowrap;">${money(it.lineTotal)}</span>
        </div>
        ${it.size ? `<div class="muted" style="font-size:0.8rem;">الحجم: ${escapeHTML(it.size.ar || "")}</div>` : ""}
        ${extras ? `<div class="muted" style="font-size:0.8rem;">إضافات: ${escapeHTML(extras)}</div>` : ""}
      </div>`;
    }).join("") || '<p class="muted">—</p>';

    const statusOptions = ORDER_STATUSES.map(st => `<option value="${st.id}" ${st.id === o.status ? "selected" : ""}>${st.icon} ${st.ar}</option>`).join("");

    const timelineHTML = (o.timeline || []).slice().reverse().map(ev => {
      let label;
      if(ev.type === "created") label = "تم إنشاء الطلب";
      else if(ev.type === "status") label = `تغيير الحالة: ${statusInfo(ev.from).ar} ← ${statusInfo(ev.to).ar}`;
      else if(ev.type === "note") label = `ملاحظة: ${ev.note}`;
      else label = ev.type;
      return `<div style="border-inline-start:2px solid var(--copper); padding-inline-start:10px; margin-bottom:8px;">
        <div style="font-size:0.85rem;">${escapeHTML(label)}</div>
        <div class="muted" style="font-size:0.72rem;">${escapeHTML(ev.by || "")} · ${fmtDate(ev.at)}</div>
      </div>`;
    }).join("") || '<p class="muted" style="font-size:0.82rem;">لا يوجد سجل بعد.</p>';

    const waCustomer = o.phone ? o.phone.replace(/[^\d]/g, "") : "";

    const body = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div class="flex" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <div class="font-display" style="font-size:1.3rem; color:var(--copper-light);">${escapeHTML(o.orderNumber || "")}</div>
            <div class="muted" style="font-size:0.8rem;">${fmtDate(o.createdAt)} · ${o.source === "staff" ? "🧑‍🍳 كاشير الموظفين" : (o.source === "website" ? "🌐 الموقع" : escapeHTML(o.source))}</div>
          </div>
          <span class="order-status-badge status-${o.status}" style="font-size:0.9rem;">${s.icon} ${s.ar}</span>
        </div>

        <div class="admin-card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">👤 بيانات العميل</h4>
          <div style="font-size:0.9rem; line-height:1.9;">
            <div>الاسم: <strong>${escapeHTML(o.customerName || "—")}</strong></div>
            <div>الجوال: <strong dir="ltr">${escapeHTML(o.phone || "—")}</strong></div>
            <div>النوع: ${o.orderType === "delivery" ? "توصيل" : (o.orderType === "dine_in" ? "صالة / طاولة" : "استلام من الفرع")}</div>
            ${o.tableNumber ? `<div>الطاولة: <strong>${escapeHTML(o.tableNumber)}</strong></div>` : ""}
            ${o.zone ? `<div>المنطقة: ${escapeHTML(o.zone)}</div>` : ""}
            ${o.address ? `<div>العنوان: ${escapeHTML(o.address)}</div>` : ""}
            ${o.notes ? `<div>ملاحظات العميل: ${escapeHTML(o.notes)}</div>` : ""}
          </div>
        </div>

        ${(o.source === "staff" || o.invoiceNumber || o.assignedEmployee) ? `
        <div class="admin-card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">🧾 بيانات التشغيل</h4>
          <div style="font-size:0.9rem; line-height:1.9;">
            ${o.invoiceNumber ? `<div>رقم الفاتورة: <strong>${escapeHTML(o.invoiceNumber)}</strong></div>` : ""}
            ${o.assignedEmployee ? `<div>أنشأه الموظف: <strong>${escapeHTML(o.assignedEmployee)}</strong></div>` : ""}
            ${o.device ? `<div class="muted" style="font-size:0.78rem; word-break:break-word;">الجهاز: ${escapeHTML(o.device)}</div>` : ""}
          </div>
        </div>` : ""}

        <div class="admin-card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">🍽️ الأصناف</h4>
          ${itemsHTML}
          <div style="margin-top:10px; font-size:0.9rem; line-height:1.9;">
            <div class="flex" style="justify-content:space-between;"><span>المجموع الفرعي</span><span>${money(o.subtotal)}</span></div>
            ${o.deliveryFee ? `<div class="flex" style="justify-content:space-between;"><span>التوصيل</span><span>${money(o.deliveryFee)}</span></div>` : ""}
            ${o.discount ? `<div class="flex" style="justify-content:space-between; color:#3BA55D;"><span>الخصم${o.couponCode ? ` (${escapeHTML(o.couponCode)})` : ""}</span><span>−${money(o.discount)}</span></div>` : ""}
            <div class="flex" style="justify-content:space-between; font-weight:700; font-size:1.05rem; border-top:1px solid var(--line); padding-top:6px; margin-top:6px;"><span>الإجمالي</span><span>${money(o.grandTotal)}</span></div>
            <div class="muted" style="font-size:0.8rem;">طريقة الدفع: ${PAY_LABELS[o.paymentMethod] || escapeHTML(o.paymentMethod)}</div>
          </div>
        </div>

        <div class="admin-card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">🔄 تغيير الحالة</h4>
          <div class="flex" style="gap:8px;">
            <select id="orderStatusSelect" class="field" style="flex:1;">${statusOptions}</select>
            <button class="btn btn-primary btn-sm" id="orderStatusSaveBtn">حفظ</button>
          </div>
        </div>

        <div class="admin-card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">📝 ملاحظة داخلية للطاقم</h4>
          <div class="flex" style="gap:8px;">
            <input id="orderNoteInput" class="field" style="flex:1;" placeholder="أضف ملاحظة...">
            <button class="btn btn-ghost btn-sm" id="orderNoteAddBtn">إضافة</button>
          </div>
        </div>

        <div class="admin-card" style="padding:12px;">
          <h4 style="margin-bottom:8px;">📜 سجل الطلب</h4>
          <div id="orderTimeline">${timelineHTML}</div>
        </div>

        <div class="flex" style="gap:8px; flex-wrap:wrap;">
          ${waCustomer ? `<a class="btn btn-primary btn-sm" href="https://wa.me/${waCustomer}" target="_blank" rel="noopener">💬 واتساب العميل</a>` : ""}
          <button class="btn btn-ghost btn-sm" id="orderPrintBtn">🖨️ طباعة الفاتورة</button>
        </div>
      </div>`;

    openModal(`الطلب ${o.orderNumber || ""}`, body, () => {
      document.getElementById("orderStatusSaveBtn")?.addEventListener("click", () => {
        changeOrderStatus(o.id, document.getElementById("orderStatusSelect").value);
      });
      document.getElementById("orderNoteAddBtn")?.addEventListener("click", () => {
        const val = (document.getElementById("orderNoteInput").value || "").trim();
        if(val) addOrderNote(o.id, val);
      });
      document.getElementById("orderPrintBtn")?.addEventListener("click", () => printInvoice(o.id));
    });
  }

  async function changeOrderStatus(id, newStatus){
    const o = orders.find(x => x.id === id);
    if(!o){ closeModal(); return; }
    if(newStatus === o.status){ closeModal(); return; }
    const ev = { type: "status", from: o.status, to: newStatus, by: currentStaffName(), at: new Date().toISOString() };
    const newTimeline = (o.timeline || []).concat([ev]);
    if(window.OSDB && OSDB.isConfigured()){
      try { await OSDB.updateOrder(id, { status: newStatus, timeline: newTimeline }); }
      catch(e){ showToast("تعذّر حفظ الحالة (تحقق من الاتصال)", "⚠️"); return; }
    }
    o.status = newStatus; o.timeline = newTimeline;
    renderOrders();
    closeModal();
    showToast("تم تحديث حالة الطلب", "✅");
  }

  async function addOrderNote(id, note){
    const o = orders.find(x => x.id === id);
    if(!o) return;
    const ev = { type: "note", note: note, by: currentStaffName(), at: new Date().toISOString() };
    const newTimeline = (o.timeline || []).concat([ev]);
    if(window.OSDB && OSDB.isConfigured()){
      try { await OSDB.updateOrder(id, { timeline: newTimeline }); }
      catch(e){ showToast("تعذّر حفظ الملاحظة", "⚠️"); return; }
    }
    o.timeline = newTimeline;
    openOrderDetails(id); // refresh modal contents
    showToast("تمت إضافة الملاحظة", "✅");
  }

  async function deleteOrderRow(id){
    if(!confirm("حذف هذا الطلب نهائيًا؟")) return;
    if(window.OSDB && OSDB.isConfigured()){
      try { await OSDB.deleteOrder(id); }
      catch(e){ showToast("تعذّر حذف الطلب", "⚠️"); return; }
    }
    orders = orders.filter(o => o.id !== id);
    _prevOrderCount = orders.length;
    renderOrders();
    showToast("تم حذف الطلب", "🗑️");
  }

  function printInvoice(id){
    const o = orders.find(x => x.id === id);
    if(!o) return;
    const rest = (db.restaurant && db.restaurant.name && db.restaurant.name.ar) ? db.restaurant.name.ar : "Over Sauce Lounge";
    const rows = (o.items || []).map(it => {
      const sz = it.size ? ` (${it.size.ar || ""})` : "";
      return `<tr><td>${escapeHTML(((it.name && it.name.ar) || "") + sz)} × ${it.qty}</td><td style="text-align:left;">${money(it.lineTotal)}</td></tr>`;
    }).join("");
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>فاتورة ${escapeHTML(o.orderNumber || "")}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111;}h1{font-size:20px;margin:0;}table{width:100%;border-collapse:collapse;margin-top:12px;}td,th{padding:6px;border-bottom:1px solid #ddd;text-align:right;}.tot td{font-weight:bold;font-size:16px;border-top:2px solid #333;}.muted{color:#666;font-size:12px;}</style>
</head><body>
<h1>${escapeHTML(rest)}</h1><div class="muted">فاتورة طلب</div>
<div style="margin-top:10px;">رقم الطلب: <strong>${escapeHTML(o.orderNumber || "")}</strong></div>
<div>التاريخ: ${fmtDate(o.createdAt)}</div>
<div>العميل: ${escapeHTML(o.customerName || "—")} — <span dir="ltr">${escapeHTML(o.phone || "")}</span></div>
<div>النوع: ${o.orderType === "delivery" ? "توصيل" : "استلام"}${o.zone ? " — " + escapeHTML(o.zone) : ""}</div>
${o.address ? `<div>العنوان: ${escapeHTML(o.address)}</div>` : ""}
<table><thead><tr><th>الصنف</th><th style="text-align:left;">السعر</th></tr></thead><tbody>${rows}</tbody></table>
<table style="margin-top:4px;">
<tr><td>المجموع الفرعي</td><td style="text-align:left;">${money(o.subtotal)}</td></tr>
${o.deliveryFee ? `<tr><td>التوصيل</td><td style="text-align:left;">${money(o.deliveryFee)}</td></tr>` : ""}
${o.discount ? `<tr><td>الخصم</td><td style="text-align:left;">−${money(o.discount)}</td></tr>` : ""}
<tr class="tot"><td>الإجمالي</td><td style="text-align:left;">${money(o.grandTotal)}</td></tr>
</table>
<div style="margin-top:8px;">طريقة الدفع: ${PAY_LABELS[o.paymentMethod] || escapeHTML(o.paymentMethod)}</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=420,height=640");
    if(!w){ showToast("اسمح بالنوافذ المنبثقة للطباعة", "⚠️"); return; }
    w.document.write(html); w.document.close();
  }

  // تنبيه صوتي للطلب الجديد — يستخدم Web Audio API (بدون ملفات خارجية).
  // المتصفحات تمنع تشغيل الصوت قبل أول تفاعل من المستخدم، لذا ننشئ السياق
  // بشكل كسول (lazy) — أول نقرة في الصفحة تفتح القناة، ثم تعمل التنبيهات.
  let _audioCtx = null;
  let _soundOn = true;
  function getAudioCtx(){
    if(_audioCtx) return _audioCtx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC) _audioCtx = new AC();
    } catch(e){ _audioCtx = null; }
    return _audioCtx;
  }
  function playNewOrderChime(){
    if(!_soundOn) return;
    const ctx = getAudioCtx();
    if(!ctx) return;
    try {
      if(ctx.state === "suspended") ctx.resume();
      // نغمتان صاعدتان قصيرتان ("دينج-دونج") تلفت الانتباه دون إزعاج.
      const now = ctx.currentTime;
      [{ f: 880, t: 0 }, { f: 1175, t: 0.16 }].forEach(({ f, t }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, now + t);
        gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.5);
      });
    } catch(e){ /* الصوت أفضل-جهد؛ لا يكسر شيئًا لو فشل */ }
  }
  // أول تفاعل من المستخدم يفتح قناة الصوت (شرط المتصفحات للتشغيل التلقائي لاحقًا)
  document.addEventListener("click", function primeAudio(){
    const ctx = getAudioCtx();
    if(ctx && ctx.state === "suspended") ctx.resume();
    document.removeEventListener("click", primeAudio);
  }, { once: true });

  async function refreshOrdersLive(){
    await loadOrders();
    if(_prevOrderCount !== 0 && orders.length > _prevOrderCount){
      const newCount = orders.length - _prevOrderCount;
      showToast(newCount > 1 ? `${newCount} طلبات جديدة وصلت! 🔔` : "طلب جديد وصل! 🔔", "🔔");
      playNewOrderChime();
      // وميض عنوان التبويب لجذب الانتباه لو المدير في تبويب آخر
      flashTitle(newCount);
    }
    _prevOrderCount = orders.length;
    renderOrders();
  }

  // وميض عنوان الصفحة عند وصول طلب والمدير في تبويب آخر
  let _titleFlash = null;
  function flashTitle(n){
    if(document.visibilityState === "visible") return;
    const original = document.title;
    let on = false;
    clearInterval(_titleFlash);
    _titleFlash = setInterval(() => {
      document.title = on ? original : `🔔 (${n}) طلب جديد!`;
      on = !on;
    }, 1000);
    const stop = () => {
      clearInterval(_titleFlash);
      document.title = original;
      document.removeEventListener("visibilitychange", stop);
    };
    document.addEventListener("visibilitychange", stop);
  }

  function openOrdersPanel(){
    refreshOrdersLive();
    if(!_ordersSubscribed && window.OSDB && OSDB.isConfigured()){
      OSDB.subscribeTable("orders", debounceAdmin(refreshOrdersLive, 1000));
      _ordersSubscribed = true;
    }
    if(window.OSDB && OSDB.isConfigured()){
      OSDB.getUser().then(u => { if(u && u.email) _staffName = u.email; }).catch(() => {});
    }
  }

  function initOrdersControls(){
    const wire = (id, key, ev) => {
      const el = document.getElementById(id);
      if(el) el.addEventListener(ev, () => { orderFilters[key] = el.value; renderOrders(); });
    };
    wire("orderSearch", "search", "input");
    wire("orderStatusFilter", "status", "change");
    wire("orderPaymentFilter", "payment", "change");
    wire("orderSort", "sort", "change");
    wire("orderDateFrom", "from", "change");
    wire("orderDateTo", "to", "change");
    document.getElementById("orderRefreshBtn")?.addEventListener("click", refreshOrdersLive);
    // زر تبديل صوت التنبيه — يتذكّر اختيار المدير عبر localStorage
    const soundBtn = document.getElementById("orderSoundToggle");
    if(soundBtn){
      try { _soundOn = localStorage.getItem("os_admin_sound") !== "off"; } catch(e){ _soundOn = true; }
      const paintSound = () => {
        soundBtn.textContent = _soundOn ? "🔔 الصوت" : "🔕 صامت";
        soundBtn.setAttribute("aria-pressed", String(_soundOn));
      };
      paintSound();
      soundBtn.addEventListener("click", () => {
        _soundOn = !_soundOn;
        try { localStorage.setItem("os_admin_sound", _soundOn ? "on" : "off"); } catch(e){}
        paintSound();
        if(_soundOn) playNewOrderChime(); // معاينة فورية عند التشغيل
        showToast(_soundOn ? "تم تشغيل صوت التنبيه" : "تم كتم صوت التنبيه", _soundOn ? "🔔" : "🔕");
      });
    }
    document.querySelector('.admin-nav-item[data-panel="orders"]')?.addEventListener("click", openOrdersPanel);
  }

  /* =================================================================
     USERS, ROLES & PERMISSIONS (RBAC — UI level)
     ================================================================= */
  let roles = [];
  let employees = [];
  let currentPermissions = null;

  const PERMISSIONS = [
    { key: "dashboard",      ar: "لوحة البيانات" },
    { key: "orders",         ar: "الطلبات" },
    { key: "products",       ar: "الأطباق" },
    { key: "categories",     ar: "الفئات" },
    { key: "coupons",        ar: "الكوبونات والعروض" },
    { key: "delivery_zones", ar: "مناطق التوصيل" },
    { key: "reviews",        ar: "التقييمات" },
    { key: "customers",      ar: "العملاء" },
    { key: "reports",        ar: "التقارير" },
    { key: "analytics",      ar: "التحليلات" },
    { key: "media",          ar: "مكتبة الوسائط" },
    { key: "notifications",  ar: "الإشعارات" },
    { key: "settings",       ar: "الإعدادات" },
    { key: "users",          ar: "الموظفون والصلاحيات" },
    { key: "backups",        ar: "النسخ الاحتياطي والاستيراد" },
    { key: "seo",            ar: "تحسين محركات البحث" },
    { key: "theme",          ar: "المظهر" }
  ];
  const ALL_PERM_KEYS = PERMISSIONS.map(p => p.key);
  // Map each existing admin panel to the permission key that unlocks it.
  const PANEL_PERMISSION = {
    dashboard: "dashboard", orders: "orders", products: "products",
    categories: "categories", coupons: "coupons", zones: "delivery_zones",
    settings: "settings", importExport: "backups", users: "users", features: "settings"
  };
  const DEFAULT_ROLES = [
    { id: "super_admin",        name: "مدير عام",      isSystem: true, permissions: ALL_PERM_KEYS.slice() },
    { id: "restaurant_manager", name: "مدير المطعم",   isSystem: true, permissions: ["dashboard","orders","products","categories","coupons","reviews","customers","reports","analytics","media","notifications"] },
    { id: "cashier",            name: "كاشير",         isSystem: true, permissions: ["dashboard","orders","customers"] },
    { id: "product_manager",    name: "مدير المنتجات", isSystem: true, permissions: ["dashboard","products","categories"] },
    { id: "marketing_manager",  name: "مدير التسويق",  isSystem: true, permissions: ["dashboard","coupons","media","notifications","seo","theme"] }
  ];

  function roleName(id){ const r = roles.find(x => x.id === id); return r ? r.name : "—"; }

  async function loadRolesEmployees(){
    if(window.OSDB && OSDB.isConfigured()){
      try { roles = await OSDB.fetchRoles(); } catch(e){ roles = []; }
      try { employees = await OSDB.fetchEmployees(); } catch(e){ employees = []; }
    }
    // Pre-seed fallback so the UI is usable even before the roles SQL is run.
    if(!roles.length) roles = DEFAULT_ROLES.map(r => ({ id: r.id, name: r.name, isSystem: r.isSystem, permissions: r.permissions.slice() }));
  }

  async function bootstrapPermissions(){
    // PIN mode (no Supabase) → single owner → full access.
    if(!(window.OSDB && OSDB.isConfigured())){
      currentPermissions = ALL_PERM_KEYS.slice();
      applyPermissions();
      return;
    }
    await loadRolesEmployees();
    let email = "";
    try { const u = await OSDB.getUser(); email = (u && u.email) ? u.email.toLowerCase() : ""; } catch(e){}
    if(email) _staffName = email;
    // The bootstrap owner (email NOT listed as an employee) always has full
    // access. A listed-but-suspended employee gets nothing. This mirrors the
    // database has_permission() function exactly.
    const empRecord = employees.find(e => (e.email || "").toLowerCase() === email);
    if(!empRecord){
      currentPermissions = ALL_PERM_KEYS.slice();
    } else if(empRecord.active === false){
      currentPermissions = [];
    } else {
      const role = roles.find(r => r.id === empRecord.roleId);
      currentPermissions = role ? (role.permissions || []) : ["dashboard"];
    }
    applyPermissions();
    renderEmployees();
    renderRoles();
  }

  function applyPermissions(){
    const perms = currentPermissions || ALL_PERM_KEYS;
    let activeStillVisible = false;
    Object.keys(PANEL_PERMISSION).forEach(panel => {
      const allowed = perms.includes(PANEL_PERMISSION[panel]);
      const nav = document.querySelector(`.admin-nav-item[data-panel="${panel}"]`);
      const sec = document.getElementById(`panel-${panel}`);
      if(nav) nav.style.display = allowed ? "" : "none";
      if(!allowed){ if(sec) sec.classList.remove("active"); if(nav) nav.classList.remove("active"); }
      if(allowed && sec && sec.classList.contains("active")) activeStillVisible = true;
    });
    if(!activeStillVisible){
      const firstNav = Array.from(document.querySelectorAll(".admin-nav-item[data-panel]")).find(n => n.style.display !== "none");
      if(firstNav) firstNav.click();
    }
  }

  function renderEmployees(){
    const tbody = document.getElementById("employeesTableBody");
    if(!tbody) return;
    if(!employees.length){
      tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center; padding:16px;">لا يوجد موظفون بعد. أضف موظفًا وحدّد دوره.</td></tr>`;
      return;
    }
    tbody.innerHTML = employees.map(e => `<tr>
      <td><strong>${escapeHTML(e.name || "—")}</strong></td>
      <td dir="ltr" style="text-align:right;">${escapeHTML(e.email || "—")}</td>
      <td>${escapeHTML(roleName(e.roleId))}</td>
      <td>${e.active !== false ? '<span class="order-status-badge status-delivered">نشط</span>' : '<span class="order-status-badge status-cancelled">موقوف</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-xs" data-edit-emp="${e.id}">تعديل</button>
        <button class="btn btn-ghost btn-xs" data-del-emp="${e.id}" style="color:#E0594A;">حذف</button>
      </td></tr>`).join("");
    tbody.querySelectorAll("[data-edit-emp]").forEach(b => b.addEventListener("click", () => openEmployeeForm(employees.find(x => x.id === b.getAttribute("data-edit-emp")))));
    tbody.querySelectorAll("[data-del-emp]").forEach(b => b.addEventListener("click", () => deleteEmployeeRow(b.getAttribute("data-del-emp"))));
  }

  function renderRoles(){
    const tbody = document.getElementById("rolesTableBody");
    if(!tbody) return;
    tbody.innerHTML = roles.map(r => `<tr>
      <td><strong>${escapeHTML(r.name)}</strong> ${r.isSystem ? '<span class="muted" style="font-size:0.72rem;">(افتراضي)</span>' : ''}</td>
      <td>${(r.permissions || []).length} صلاحية</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-ghost btn-xs" data-edit-role="${r.id}">الصلاحيات</button>
        <button class="btn btn-ghost btn-xs" data-dup-role="${r.id}">نسخ</button>
        ${r.isSystem ? '' : `<button class="btn btn-ghost btn-xs" data-del-role="${r.id}" style="color:#E0594A;">حذف</button>`}
      </td></tr>`).join("");
    tbody.querySelectorAll("[data-edit-role]").forEach(b => b.addEventListener("click", () => openRoleForm(roles.find(x => x.id === b.getAttribute("data-edit-role")))));
    tbody.querySelectorAll("[data-dup-role]").forEach(b => b.addEventListener("click", () => duplicateRole(b.getAttribute("data-dup-role"))));
    tbody.querySelectorAll("[data-del-role]").forEach(b => b.addEventListener("click", () => deleteRoleRow(b.getAttribute("data-del-role"))));
  }

  function openEmployeeForm(emp){
    const roleOptions = roles.map(r => `<option value="${r.id}" ${emp && emp.roleId === r.id ? "selected" : ""}>${escapeHTML(r.name)}</option>`).join("");
    const body = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div><label class="field-label">الاسم</label><input id="empName" class="field" value="${emp ? escapeHTML(emp.name || "") : ""}" placeholder="اسم الموظف"></div>
        <div><label class="field-label">البريد الإلكتروني (نفس بريد تسجيل الدخول)</label><input id="empEmail" type="email" dir="ltr" class="field" value="${emp ? escapeHTML(emp.email || "") : ""}" placeholder="name@email.com"></div>
        <div><label class="field-label">الدور</label><select id="empRole" class="field">${roleOptions}</select></div>
        <label class="flex" style="gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" id="empActive" ${!emp || emp.active !== false ? "checked" : ""}> <span>الحساب نشط</span></label>
        <button class="btn btn-primary" id="empSaveBtn">حفظ</button>
        <p class="muted" style="font-size:0.78rem; line-height:1.6;">لتفعيل دخول الموظف فعليًا، أنشئ له حسابًا بنفس البريد من Supabase ← Authentication ← Users.</p>
      </div>`;
    openModal(emp ? "تعديل موظف" : "إضافة موظف", body, () => {
      document.getElementById("empSaveBtn").addEventListener("click", async () => {
        const name = document.getElementById("empName").value.trim();
        const email = document.getElementById("empEmail").value.trim();
        if(!name || !email){ showToast("الاسم والبريد مطلوبان", "⚠️"); return; }
        const obj = { id: emp ? emp.id : uid("emp"), name, email, roleId: document.getElementById("empRole").value, active: document.getElementById("empActive").checked };
        if(window.OSDB && OSDB.isConfigured()){
          try { await OSDB.saveEmployee(obj); } catch(e){ showToast("تعذّر الحفظ", "⚠️"); return; }
        }
        const idx = employees.findIndex(x => x.id === obj.id);
        if(idx >= 0) employees[idx] = obj; else employees.push(obj);
        renderEmployees(); closeModal(); showToast("تم حفظ الموظف", "✅");
      });
    });
  }

  function openRoleForm(role){
    const checks = PERMISSIONS.map(p => {
      const on = role && (role.permissions || []).includes(p.key);
      return `<label class="perm-check"><input type="checkbox" value="${p.key}" ${on ? "checked" : ""}> <span>${p.ar}</span></label>`;
    }).join("");
    const body = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div><label class="field-label">اسم الدور</label><input id="roleName" class="field" value="${role ? escapeHTML(role.name) : ""}" placeholder="اسم الدور"></div>
        <div><label class="field-label">الصلاحيات</label><div class="perm-grid">${checks}</div></div>
        <button class="btn btn-primary" id="roleSaveBtn">حفظ</button>
      </div>`;
    openModal(role ? "صلاحيات الدور" : "دور جديد", body, () => {
      document.getElementById("roleSaveBtn").addEventListener("click", async () => {
        const name = document.getElementById("roleName").value.trim();
        if(!name){ showToast("اسم الدور مطلوب", "⚠️"); return; }
        const permissions = Array.from(document.querySelectorAll("#adminModalBody .perm-check input:checked")).map(i => i.value);
        const obj = { id: role ? role.id : uid("role"), name, permissions, isSystem: role ? !!role.isSystem : false };
        if(window.OSDB && OSDB.isConfigured()){
          try { await OSDB.saveRole(obj); } catch(e){ showToast("تعذّر الحفظ", "⚠️"); return; }
        }
        const idx = roles.findIndex(x => x.id === obj.id);
        if(idx >= 0) roles[idx] = obj; else roles.push(obj);
        renderRoles();
        bootstrapPermissions(); // re-apply gating live in case it's my own role
        closeModal(); showToast("تم حفظ الدور", "✅");
      });
    });
  }

  async function duplicateRole(id){
    const r = roles.find(x => x.id === id);
    if(!r) return;
    const obj = { id: uid("role"), name: r.name + " (نسخة)", permissions: (r.permissions || []).slice(), isSystem: false };
    if(window.OSDB && OSDB.isConfigured()){
      try { await OSDB.saveRole(obj); } catch(e){ showToast("تعذّر النسخ", "⚠️"); return; }
    }
    roles.push(obj); renderRoles(); showToast("تم نسخ الدور", "✅");
  }

  async function deleteRoleRow(id){
    const r = roles.find(x => x.id === id);
    if(r && r.isSystem){ showToast("لا يمكن حذف دور افتراضي", "⚠️"); return; }
    if(!confirm("حذف هذا الدور؟")) return;
    if(window.OSDB && OSDB.isConfigured()){
      try { await OSDB.deleteRole(id); } catch(e){ showToast("تعذّر الحذف", "⚠️"); return; }
    }
    roles = roles.filter(x => x.id !== id); renderRoles(); showToast("تم حذف الدور", "🗑️");
  }

  async function deleteEmployeeRow(id){
    if(!confirm("حذف هذا الموظف؟")) return;
    if(window.OSDB && OSDB.isConfigured()){
      try { await OSDB.deleteEmployee(id); } catch(e){ showToast("تعذّر الحذف", "⚠️"); return; }
    }
    employees = employees.filter(x => x.id !== id); renderEmployees(); showToast("تم حذف الموظف", "🗑️");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initNav();
    initExport();
    initImport();
    initSettingsSave();
    initOrdersControls();

    await loadDB();
    initLogin();

    document.getElementById("addCategoryBtn").addEventListener("click", () => openCategoryForm(null));
    document.getElementById("addProductBtn").addEventListener("click", () => openProductForm(null));
    document.getElementById("addCouponBtn").addEventListener("click", () => openCouponForm(null));
    document.getElementById("addDealBtn")?.addEventListener("click", () => openDealForm(null));
    document.getElementById("addZoneBtn").addEventListener("click", () => openZoneForm(null));
    document.getElementById("addEmployeeBtn")?.addEventListener("click", () => openEmployeeForm(null));
    document.getElementById("addRoleBtn")?.addEventListener("click", () => openRoleForm(null));
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
