/* =====================================================================
   supabase.js — Over Sauce Lounge data-access layer
   ---------------------------------------------------------------------
   Bridges the flat Supabase schema <-> the nested shape the app expects.
   Exposes window.OSDB. Reads are used by app.js (customer site); the
   auth / write / storage helpers are used by the admin panel.
   No business logic lives here — pure data access + shape mapping.
   ===================================================================== */
(function () {
  "use strict";

  var CFG = window.OS_CONFIG || {};
  var _client = null;

  function configured() {
    return !!(
      window.supabase &&
      CFG.SUPABASE_URL && CFG.SUPABASE_PUBLISHABLE_KEY &&
      CFG.SUPABASE_URL.indexOf("PASTE_") !== 0 &&
      CFG.SUPABASE_PUBLISHABLE_KEY.indexOf("PASTE_") !== 0
    );
  }
  function client() {
    if (!_client) _client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_PUBLISHABLE_KEY);
    return _client;
  }

  /* ---------------- DB row  ->  app shape ---------------- */
  function toCategory(r) {
    return { id: r.id, icon: r.icon, name: { ar: r.name_ar, en: r.name_en }, order: r.sort_order };
  }
  function toProduct(r) {
    return {
      id: r.id,
      category: r.category_id,
      name: { ar: r.name_ar, en: r.name_en },
      description: { ar: r.description_ar || "", en: r.description_en || "" },
      price: Number(r.price),
      oldPrice: r.old_price != null ? Number(r.old_price) : null,
      image: r.image_url || "",
      badges: r.badges || [],
      rating: Number(r.rating),
      orders: r.orders_count || 0,
      inStock: r.in_stock,
      sizes: r.sizes || [],     // jsonb already in nested {id,name:{ar,en},priceDiff} shape
      extras: r.extras || [],   // jsonb already in nested {id,name:{ar,en},price} shape
      calories: r.calories != null ? r.calories : null,
      allergens: r.allergens || []
    };
  }
  function toCoupon(r) {
    return {
      code: r.code, type: r.type, value: Number(r.value), minOrder: Number(r.min_order),
      label: { ar: r.label_ar || "", en: r.label_en || "" }, active: r.active
    };
  }
  function toZone(r) {
    return { id: r.id, name: { ar: r.name_ar, en: r.name_en }, fee: Number(r.fee), etaMinutes: r.eta_minutes };
  }
  function toDeal(r) {
    return {
      id: r.id, title: { ar: r.title_ar, en: r.title_en },
      subtitle: { ar: r.subtitle_ar || "", en: r.subtitle_en || "" },
      discountPercent: r.discount_percent, endsInHours: r.ends_in_hours,
      imageUrl: r.image_url || ""
    };
  }
  function toRestaurant(r) {
    return {
      name: { ar: r.name_ar, en: r.name_en },
      tagline: { ar: r.tagline_ar || "", en: r.tagline_en || "" },
      phone: r.phone || "", whatsapp: r.whatsapp_number || "",
      vatNumber: r.vat_number || "",
      address: { ar: r.address_ar || "", en: r.address_en || "" },
      openingHours: { ar: r.opening_hours_ar || "", en: r.opening_hours_en || "" },
      mapsUrl: r.maps_url || "",
      social: {
        instagram: r.instagram_url || "", tiktok: r.tiktok_url || "",
        snapchat: r.snapchat_url || "", facebook: r.facebook_url || "",
        whatsappChannel: r.whatsapp_channel_url || ""
      },
      stats: {
        yearsOfExperience: r.years_experience || 0, happyCustomers: r.happy_customers || 0,
        menuItems: r.menu_items_count || 0, averageRating: Number(r.average_rating || 0)
      },
      ordersPaused: !!r.orders_paused,
      features: r.feature_flags || {}
    };
  }

  /* ---------------- reads ---------------- */
  async function sel(table, orderCol) {
    var q = client().from(table).select("*");
    if (orderCol) q = q.order(orderCol, { ascending: true });
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function fetchAll() {
    var results = await Promise.all([
      sel("categories", "sort_order"),
      sel("products", "sort_order"),
      sel("coupons"),
      sel("flash_deals", "sort_order"),
      sel("delivery_zones", "sort_order"),
      sel("restaurant_settings")
    ]);
    var cats = results[0], prods = results[1], coups = results[2],
        deals = results[3], zones = results[4], s = results[5][0] || {};

    return {
      categories: cats.map(toCategory),
      products: prods.map(toProduct),
      coupons: coups.filter(function (c) { return c.active; }).map(toCoupon),
      flashDeals: deals.filter(function (d) { return d.active; }).map(toDeal),
      zones: zones.map(toZone),
      minimumOrder: Number(s.minimum_order || 0),
      restaurant: toRestaurant(s),
      currency: s.currency || null,
      whatsappNumber: s.whatsapp_number || null,
      ordersPaused: !!s.orders_paused
    };
  }

  /* ---------------- auth (used by admin) ---------------- */
  async function signIn(email, password) {
    var res = await client().auth.signInWithPassword({ email: email, password: password });
    if (res.error) throw res.error;
    return res.data;
  }
  async function signOut() { await client().auth.signOut(); }
  async function getUser() {
    var res = await client().auth.getSession();
    return (res.data && res.data.session) ? res.data.session.user : null;
  }
  function onAuthChange(cb) {
    client().auth.onAuthStateChange(function (_event, session) {
      cb(session ? session.user : null);
    });
  }

  /* ---------------- app shape  ->  DB row (writes) ---------------- */
  function fromProduct(p) {
    return {
      id: p.id, category_id: p.category,
      name_ar: p.name.ar, name_en: p.name.en,
      description_ar: (p.description && p.description.ar) || "",
      description_en: (p.description && p.description.en) || "",
      price: p.price, old_price: p.oldPrice != null ? p.oldPrice : null,
      image_url: p.image || "", badges: p.badges || [],
      rating: p.rating != null ? p.rating : 4.5,
      orders_count: p.orders || 0, in_stock: p.inStock !== false,
      sizes: p.sizes || [], extras: p.extras || [],
      calories: p.calories != null ? p.calories : null,
      allergens: p.allergens || []
    };
  }
  function fromCategory(c) {
    return { id: c.id, icon: c.icon || "🍽️", name_ar: c.name.ar, name_en: c.name.en, sort_order: c.order || 1 };
  }
  function fromCoupon(c) {
    return {
      code: c.code, type: c.type, value: c.value, min_order: c.minOrder || 0,
      label_ar: (c.label && c.label.ar) || "", label_en: (c.label && c.label.en) || "",
      active: c.active !== false
    };
  }
  function fromZone(z) {
    return { id: z.id, name_ar: z.name.ar, name_en: z.name.en, fee: z.fee || 0, eta_minutes: z.etaMinutes || 30 };
  }
  function fromDeal(d) {
    return {
      id: d.id, title_ar: d.title.ar, title_en: d.title.en,
      subtitle_ar: (d.subtitle && d.subtitle.ar) || "", subtitle_en: (d.subtitle && d.subtitle.en) || "",
      discount_percent: d.discountPercent || 0, ends_in_hours: d.endsInHours || 24,
      image_url: d.imageUrl || "",
      active: d.active !== false
    };
  }

  async function upsert(table, row) {
    var res = await client().from(table).upsert(row);
    if (res.error) throw res.error;
    return true;
  }
  async function del(table, col, val) {
    var res = await client().from(table).delete().eq(col, val);
    if (res.error) throw res.error;
    return true;
  }

  /* ---------------- storage (product images) ---------------- */
  async function uploadProductImage(file) {
    // Validate: must be an image, max 5 MB. (Backstop — the admin also checks.)
    if (!file || !/^image\//.test(file.type || "")) {
      throw new Error("الملف يجب أن يكون صورة");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("حجم الصورة يجب أن يكون أقل من 5 ميجابايت");
    }
    var ext = (String(file.name || "img").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!ext) ext = "jpg";
    var path = "products/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    var up = await client().storage.from("product-images").upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
    if (up.error) throw up.error;
    return client().storage.from("product-images").getPublicUrl(path).data.publicUrl;
  }

  /* ---------------- settings (single row id=1) ---------------- */
  async function saveSettings(restaurant, minimumOrder, currency, ordersPaused) {
    var row = {
      name_ar: restaurant.name.ar, name_en: restaurant.name.en,
      tagline_ar: (restaurant.tagline && restaurant.tagline.ar) || "",
      tagline_en: (restaurant.tagline && restaurant.tagline.en) || "",
      phone: restaurant.phone || "", whatsapp_number: restaurant.whatsapp || "",
      vat_number: restaurant.vatNumber || "",
      address_ar: (restaurant.address && restaurant.address.ar) || "",
      address_en: (restaurant.address && restaurant.address.en) || "",
      opening_hours_ar: (restaurant.openingHours && restaurant.openingHours.ar) || "",
      opening_hours_en: (restaurant.openingHours && restaurant.openingHours.en) || "",
      maps_url: restaurant.mapsUrl || "",
      instagram_url: (restaurant.social && restaurant.social.instagram) || "",
      tiktok_url: (restaurant.social && restaurant.social.tiktok) || "",
      snapchat_url: (restaurant.social && restaurant.social.snapchat) || "",
      facebook_url: (restaurant.social && restaurant.social.facebook) || "",
      whatsapp_channel_url: (restaurant.social && restaurant.social.whatsappChannel) || "",
      minimum_order: minimumOrder || 0
    };
    if (restaurant.stats) {
      row.years_experience = restaurant.stats.yearsOfExperience || 0;
      row.happy_customers = restaurant.stats.happyCustomers || 0;
      row.menu_items_count = restaurant.stats.menuItems || 0;
      row.average_rating = restaurant.stats.averageRating || 4.5;
    }
    if (currency) row.currency = currency;
    if (typeof ordersPaused === "boolean") row.orders_paused = ordersPaused;
    if (restaurant.features) row.feature_flags = restaurant.features;
    var res = await client().from("restaurant_settings").update(row).eq("id", 1);
    if (res.error) throw res.error;
    return true;
  }

  /* ---------------- realtime (optional live refresh) ---------------- */
  function subscribe(onChange) {
    try {
      client()
        .channel("os-public-changes")
        .on("postgres_changes", { event: "*", schema: "public" }, function () { onChange(); })
        .subscribe();
    } catch (e) { /* realtime is best-effort */ }
  }

  /* ---------------- full sync (admin "save") ---------------- */
  // Upserts every row in a table from the local list, then deletes any
  // remaining DB rows whose id/code no longer exists locally.
  async function syncTable(table, items, mapFn, idCol) {
    var rows = (items || []).map(mapFn);
    if (rows.length) {
      var up = await client().from(table).upsert(rows);
      if (up.error) throw up.error;
    }
    var keep = rows.map(function (r) { return r[idCol]; });
    var existing = await client().from(table).select(idCol);
    if (existing.error) throw existing.error;
    var toDelete = (existing.data || [])
      .map(function (r) { return r[idCol]; })
      .filter(function (id) { return keep.indexOf(id) === -1; });
    if (toDelete.length) {
      var d = await client().from(table).delete().in(idCol, toDelete);
      if (d.error) throw d.error;
    }
  }

  // An RLS denial means "this staff member isn't allowed to write this table".
  // We skip those silently (their role simply can't touch it); any OTHER error
  // (network, schema, etc.) is re-thrown so the admin can show a real warning.
  function isRlsDenial(e) {
    var msg = ((e && (e.message || e.error_description)) || "") + "";
    var code = e && (e.code || (e.details && e.details.code));
    return code === "42501" || /row-level security|violates row-level/i.test(msg);
  }

  async function syncAll(db) {
    async function tryStep(fn) {
      try { await fn(); }
      catch (e) { if (!isRlsDenial(e)) throw e; }
    }
    await tryStep(() => syncTable("categories", db.categories, fromCategory, "id"));
    await tryStep(() => syncTable("products", db.products, fromProduct, "id"));
    await tryStep(() => syncTable("coupons", db.coupons, fromCoupon, "code"));
    await tryStep(() => syncTable("delivery_zones", db.deliveryZones, fromZone, "id"));
    await tryStep(() => syncTable("flash_deals", db.flashDeals, fromDeal, "id"));
    if (db.restaurant) {
      await tryStep(() => saveSettings(db.restaurant, db.minimumOrder, db.currency || null, db.restaurant.ordersPaused));
    }
  }

  /* ---------------- orders ---------------- */
  function toOrder(r) {
    return {
      id: r.id,
      orderNumber: r.order_number,
      customerName: r.customer_name || "",
      phone: r.phone || "",
      address: r.address || "",
      mapsLink: r.maps_link || "",
      orderType: r.order_type || "delivery",
      zone: r.zone || "",
      tableNumber: r.table_number || "",
      invoiceNumber: r.invoice_number || "",
      device: r.device || "",
      items: r.items || [],
      notes: r.notes || "",
      couponCode: r.coupon_code || "",
      discount: Number(r.discount) || 0,
      vat: Number(r.vat) || 0,
      deliveryFee: Number(r.delivery_fee) || 0,
      subtotal: Number(r.subtotal) || 0,
      grandTotal: Number(r.grand_total) || 0,
      paymentMethod: r.payment_method || "cash",
      source: r.source || "website",
      status: r.status || "pending",
      assignedEmployee: r.assigned_employee || "",
      timeline: r.timeline || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
  function fromOrder(o) {
    return {
      id: o.id,
      customer_name: o.customerName || "",
      phone: o.phone || "",
      address: o.address || "",
      maps_link: o.mapsLink || "",
      order_type: o.orderType || "delivery",
      zone: o.zone || "",
      table_number: o.tableNumber || "",
      device: o.device || "",
      items: o.items || [],
      notes: o.notes || "",
      coupon_code: o.couponCode || "",
      discount: o.discount || 0,
      vat: o.vat || 0,
      delivery_fee: o.deliveryFee || 0,
      subtotal: o.subtotal || 0,
      grand_total: o.grandTotal || 0,
      payment_method: o.paymentMethod || "cash",
      source: o.source || "website",
      status: o.status || "pending",
      assigned_employee: o.assignedEmployee || "",
      timeline: o.timeline || []
      // order_number is generated by the DB default — never sent.
    };
  }
  async function createOrder(o) {
    var res = await client().from("orders").insert(fromOrder(o)).select().single();
    if (res.error) throw res.error;
    return toOrder(res.data);
  }
  async function fetchOrders() {
    var res = await client().from("orders").select("*").order("created_at", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(toOrder);
  }
  async function updateOrder(id, patch) {
    patch.updated_at = new Date().toISOString();
    var res = await client().from("orders").update(patch).eq("id", id);
    if (res.error) throw res.error;
    return true;
  }
  async function deleteOrder(id) {
    var res = await client().from("orders").delete().eq("id", id);
    if (res.error) throw res.error;
    return true;
  }

  // Realtime for a single table (used by the admin orders dashboard).
  function subscribeTable(table, onChange) {
    try {
      client()
        .channel("os-" + table + "-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: table }, function () { onChange(); })
        .subscribe();
    } catch (e) { /* realtime is best-effort */ }
  }

  /* ---------------- roles & employees (RBAC) ---------------- */
  function toRole(r) {
    return { id: r.id, name: r.name, permissions: r.permissions || [], isSystem: !!r.is_system };
  }
  function fromRole(o) {
    return { id: o.id, name: o.name, permissions: o.permissions || [], is_system: !!o.isSystem };
  }
  function toEmployee(r) {
    return { id: r.id, name: r.name || "", email: r.email || "", roleId: r.role_id || "", active: r.active !== false };
  }
  function fromEmployee(o) {
    return { id: o.id, name: o.name || "", email: o.email || "", role_id: o.roleId || "", active: o.active !== false };
  }
  async function fetchRoles() {
    var res = await client().from("roles").select("*").order("created_at", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(toRole);
  }
  async function fetchEmployees() {
    var res = await client().from("employees").select("*").order("created_at", { ascending: true });
    if (res.error) throw res.error;
    return (res.data || []).map(toEmployee);
  }

  /* ---------------- public API ---------------- */
  window.OSDB = {
    isConfigured: configured,
    fetchAll: fetchAll,
    subscribe: subscribe,
    subscribeTable: subscribeTable,
    syncAll: syncAll,
    // orders
    createOrder: createOrder,
    fetchOrders: fetchOrders,
    updateOrder: updateOrder,
    deleteOrder: deleteOrder,
    // roles & employees
    fetchRoles: fetchRoles,
    saveRole: function (o) { return upsert("roles", fromRole(o)); },
    deleteRole: function (id) { return del("roles", "id", id); },
    fetchEmployees: fetchEmployees,
    saveEmployee: function (o) { return upsert("employees", fromEmployee(o)); },
    deleteEmployee: function (id) { return del("employees", "id", id); },
    // auth
    signIn: signIn, signOut: signOut, getUser: getUser, onAuthChange: onAuthChange,
    // writes
    saveProduct: function (p) { return upsert("products", fromProduct(p)); },
    deleteProduct: function (id) { return del("products", "id", id); },
    saveCategory: function (c) { return upsert("categories", fromCategory(c)); },
    deleteCategory: function (id) { return del("categories", "id", id); },
    saveCoupon: function (c) { return upsert("coupons", fromCoupon(c)); },
    deleteCoupon: function (code) { return del("coupons", "code", code); },
    saveZone: function (z) { return upsert("delivery_zones", fromZone(z)); },
    deleteZone: function (id) { return del("delivery_zones", "id", id); },
    saveFlashDeal: function (d) { return upsert("flash_deals", fromDeal(d)); },
    deleteFlashDeal: function (id) { return del("flash_deals", "id", id); },
    saveSettings: saveSettings,
    // storage
    uploadProductImage: uploadProductImage
  };
})();
