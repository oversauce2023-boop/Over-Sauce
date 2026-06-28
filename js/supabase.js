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
      discountPercent: r.discount_percent, endsInHours: r.ends_in_hours
    };
  }
  function toRestaurant(r) {
    return {
      name: { ar: r.name_ar, en: r.name_en },
      tagline: { ar: r.tagline_ar || "", en: r.tagline_en || "" },
      phone: r.phone || "", whatsapp: r.whatsapp_number || "",
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
      ordersPaused: !!r.orders_paused
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
    var ext = (String(file.name || "img").split(".").pop() || "jpg").toLowerCase();
    var path = "products/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    var up = await client().storage.from("product-images").upload(path, file, { upsert: true, cacheControl: "3600" });
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

  async function syncAll(db) {
    await syncTable("categories", db.categories, fromCategory, "id");
    await syncTable("products", db.products, fromProduct, "id");
    await syncTable("coupons", db.coupons, fromCoupon, "code");
    await syncTable("delivery_zones", db.deliveryZones, fromZone, "id");
    await syncTable("flash_deals", db.flashDeals, fromDeal, "id");
    if (db.restaurant) {
      await saveSettings(db.restaurant, db.minimumOrder, db.currency || null, db.restaurant.ordersPaused);
    }
  }

  /* ---------------- public API ---------------- */
  window.OSDB = {
    isConfigured: configured,
    fetchAll: fetchAll,
    subscribe: subscribe,
    syncAll: syncAll,
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
