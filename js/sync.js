/* ============================================================
   UVID — catalog sync (storefront ⇄ backend)
   Loads products & categories from /api so the storefront always
   shows what is saved through the admin panel. Live-refreshes on
   SSE catalog events (/api/events) and falls back to the bundled
   catalog if the API is unreachable (offline / static hosting).
   Data lives here only in memory — no localStorage caching.
   ============================================================ */

(function () {
  "use strict";

  var PT = window.PT;
  if (!PT || !Array.isArray(PT.PRODUCTS) || !Array.isArray(PT.CATEGORIES)) return;
  /* These products and photos are bundled with the storefront source. Keep a
     stable snapshot so API refreshes don't erase locally maintained entries. */
  var codeProducts = (window.UVID_CODE_PRODUCTS || []).map(toProduct);
  var bundledProducts = PT.PRODUCTS.filter(function (p) { return p.localOnly === true; }).concat(codeProducts);
  var codeCategoryCounts = Object.create(null);
  var initialIds = Object.create(null);
  PT.PRODUCTS.forEach(function (p) { initialIds[p.id] = true; });
  codeProducts.forEach(function (p) {
    codeCategoryCounts[p.category] = (codeCategoryCounts[p.category] || 0) + 1;
    if (!initialIds[p.id]) {
      PT.PRODUCTS.push(p);
      PT.visibleProducts.push(p);
      initialIds[p.id] = true;
    }
    if (!PT.categoryBySlug(p.category)) {
      PT.CATEGORIES.push({ slug: p.category, label: p.category === "concrete-art" ? "CONCRETE ART" : p.category, emoji: "🧱", blurb: "Decorative concrete art pieces", count: codeCategoryCounts[p.category] });
    }
  });
  Object.keys(codeCategoryCounts).forEach(function (slug) {
    var category = PT.categoryBySlug(slug);
    if (category) category.count = Math.max(Number(category.count) || 0, codeCategoryCounts[slug]);
  });

  var booted = false;    /* true once the router has registered */
  var loading = false;   /* a refresh is in flight */
  var queued = false;    /* another refresh arrived mid-flight */
  var refreshTimer = null;
  var paintPending = false;

  var BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEALAAAAAABAAEAAAIBRAA7";

  /* ---------------- helpers ---------------- */

  function fetchJson(path) {
    return fetch(path, { cache: "no-store", credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error(path + " (" + res.status + ")");
      return res.json();
    });
  }

  /* mutate arrays in place so closed-over references (findProduct,
     categoryBySlug, ui.js views) keep pointing at the live data */
  function replace(arr, next) {
    arr.length = 0;
    for (var i = 0; i < next.length; i++) arr.push(next[i]);
  }

  function fallbackProductImage(raw) {
    var key = String((raw && raw.id) || "").toLowerCase() + " " + String((raw && raw.productName) || "").toLowerCase();
    if (/metal[- ]stand/.test(key)) {
      if (/xcc8b/.test(key)) return "/assets/display-stands/8-inch-black.jpeg";
      if (/xcc8g/.test(key)) return "/assets/display-stands/8-inch-gold.jpeg";
      if (/xcc10b/.test(key)) return "/assets/display-stands/10-inch-black.jpeg";
      if (/xaa6s/.test(key)) return "/assets/display-stands/6-inch-silver.jpeg";
      if (/xaa4b/.test(key)) return "/assets/display-stands/4-5-inch-black.jpeg";
      if (/xaa4rg/.test(key)) return "/assets/display-stands/4-5-inch-rose-gold.jpeg";
      if (/xcc4g|4inch/.test(key)) return "/assets/display-stands/4-inch-gold.jpeg";
      if (/3-inch/.test(key) && /black|xcc3b/.test(key)) return "/assets/display-stands/3-inch-black.jpeg";
      if (/3-inch/.test(key) && /gold|xcc3g/.test(key)) return "/assets/display-stands/3-inch-gold.jpeg";
      if (/3-inch/.test(key) && /rose|xcc3rg/.test(key)) return "/assets/display-stands/3-inch-rose-gold.jpeg";
    }
    return PT.art((raw && raw.emoji) || "📦", (raw && raw.bg) || "#EEF2FF", (raw && raw.ink) || "#4C5BD4");
  }

  function productForImage(image) {
    var link = image.closest ? image.closest('a[href*="#/p/"]') : null;
    var href = link ? link.getAttribute("href") : "";
    var match = href.match(/#\/p\/([^?#/]+)/);
    var id = match ? decodeURIComponent(match[1]) : "";
    if (!id && image.id === "pdpImg") {
      match = String(location.hash || "").match(/#\/p\/([^?#/]+)/);
      id = match ? decodeURIComponent(match[1]) : "";
    }
    if (id && PT.findProduct) return PT.findProduct(id);
    var label = String(image.alt || "").trim().toLowerCase();
    if (label) {
      for (var i = 0; i < PT.PRODUCTS.length; i++) {
        if (String(PT.PRODUCTS[i].name || "").trim().toLowerCase() === label) return PT.PRODUCTS[i];
      }
    }
    return null;
  }

  /* When the hosted image store is unavailable, keep product tiles usable and
     show a local photo where one is bundled, otherwise show the product art. */
  document.addEventListener("error", function (event) {
    var image = event.target;
    if (!image || image.tagName !== "IMG" || image.dataset.uvidFallbackUsed) return;
    if (!image.closest || !image.closest(".pcard, .pdp__imgwrap, .cline__img, .mini, .sd, .mould-showcase__item")) return;
    image.dataset.uvidFallbackUsed = "true";
    var product = productForImage(image);
    image.src = product && product.fallbackImg ? product.fallbackImg : PT.art("📦", "#F1EEE5", "#807968");
  }, true);

  /* map one API product (server publicView) into the storefront shape */
  function toProduct(raw) {
    var price = Number(raw.price) || 0;
    var mrp = raw.mrp == null ? price : Number(raw.mrp);
    if (!(mrp >= price)) mrp = price;
    var discount = mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
    var desc = String(raw.description || "");
    var highlights = Array.isArray(raw.highlights) && raw.highlights.length
      ? raw.highlights.slice()
      : desc.split(/\s*[•·]\s*/).filter(Boolean);
    var specs = raw.specs && typeof raw.specs === "object" ? raw.specs : null;
    if (!specs) specs = desc ? { Description: desc } : {};
    var gallery = Array.isArray(raw.images)
      ? raw.images.map(function (im) { return { id: im.id, url: im.url, altText: im.altText || "", variantKey: im.variantKey || null }; })
      : [];
    var img = raw.imageUrl || (gallery[0] && gallery[0].url) ||
      (PT.art ? PT.art(raw.emoji || "📦", raw.bg || "#EEF2FF", raw.ink || "#4C5BD4") : BLANK_IMG);
    var fallbackImg = fallbackProductImage(raw);

    return {
      id: raw.id,
      name: raw.productName || raw.id,
      brand: raw.brand || "UVID",
      category: raw.category || "other",
      price: price,
      mrp: mrp,
      rating: raw.rating != null ? Number(raw.rating) : null,
      ratingCount: Number(raw.ratingCount) || 0,
      emoji: raw.emoji || "📦",
      bg: raw.bg || "#EEF2FF",
      ink: raw.ink || "#4C5BD4",
      stock: Number(raw.stockQuantity) || 0,
      tags: Array.isArray(raw.tags) ? raw.tags.slice() : [],
      highlights: highlights,
      specs: specs,
      description: desc,
      parent: raw.parent || null,
      variantLabel: raw.variantLabel || null,
      img: img,
      fallbackImg: fallbackImg,
      thumb: img,
      images: gallery,
      discount: discount,
      added: Date.parse(raw.createdAt || "") || 0,
      popularity: (Number(raw.ratingCount) || 0) + discount * 7
    };
  }

  /* swap PT data for fresh server data (ARCHIVED rows never arrive) */
  function apply(rawProducts, rawCategories) {
    var list = (rawProducts || []).map(toProduct);
    var i;

    /* The server catalog remains authoritative for server-backed products.
       Add bundled products that are intentionally maintained in local files. */
    var ids = Object.create(null);
    for (i = 0; i < list.length; i++) ids[list[i].id] = true;
    for (i = 0; i < bundledProducts.length; i++) {
      if (!ids[bundledProducts[i].id]) {
        list.push(bundledProducts[i]);
        ids[bundledProducts[i].id] = true;
      }
    }

    /* categories: API rows include an optional parentSlug for subcategories */
    var cats = (rawCategories || []).map(function (c) {
      return {
        slug: c.slug,
        label: c.name || c.slug,
        parentSlug: c.parentSlug || c.parent_slug || null,
        emoji: c.emoji || "🗂️",
        blurb: c.blurb || "",
        count: c.count || 0
      };
    });

    /* every product's category must resolve (crumbs/filters safety) */
    var seen = {};
    for (i = 0; i < cats.length; i++) seen[cats[i].slug] = true;
    for (i = 0; i < list.length; i++) {
      if (!seen[list[i].category] && list[i].category !== "uncategorized") {
        seen[list[i].category] = true;
        cats.push({ slug: list[i].category, label: list[i].category, emoji: "🗂️", blurb: "", count: 0 });
      }
    }

    /* link colour/option children (meta.parent) to their parent product */
    var kids = {};
    for (i = 0; i < list.length; i++) {
      if (list[i].parent) (kids[list[i].parent] = kids[list[i].parent] || []).push(list[i]);
    }
    for (i = 0; i < list.length; i++) {
      var main = list[i];
      var mine = kids[main.id];
      if (!mine || !mine.length) continue;
      main.variants = mine.map(function (c) {
        var label = c.variantLabel ||
          (c.name.indexOf(" — ") > -1 ? c.name.split(" — ").slice(1).join(" — ") : c.name);
        return { id: c.id, size: label, label: label, price: c.price, mrp: c.mrp, stock: c.stock, img: c.img, images: c.images || [] };
      });
      /* Parent stock is the total available across its selectable options. */
      main.stock = main.variants.reduce(function (total, v) { return total + (Number(v.stock) || 0); }, 0);
    }

    /* "newest" ordering — fall back to list order when createdAt missing */
    for (i = 0; i < list.length; i++) if (!list[i].added) list[i].added = list.length - i;

    replace(PT.CATEGORIES, cats);
    replace(PT.PRODUCTS, list);
    replace(PT.visibleProducts, list.filter(function (p) { return p.tags.indexOf("vc-hidden") === -1; }));
    document.dispatchEvent(new Event("pt:catalog"));
  }

  /* ---------------- refresh cycle ---------------- */

  function paint() {
    if (!booted) return;
    var ae = document.activeElement;
    /* don't yank the page while the customer is typing */
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { paintPending = true; return; }
    paintPending = false;
    if (window.PT.View && typeof window.PT.View.rerender === "function") window.PT.View.rerender();
  }

  function refresh() {
    if (loading) { queued = true; return; }
    loading = true;
    Promise.all([fetchJson("/api/products"), fetchJson("/api/products/categories")])
      .then(function (res) {
        apply(res[0].products, res[1].categories);
        paint();
      })
      .catch(function () { /* API unreachable — keep the bundled catalog */ })
      .then(function () {
        loading = false;
        if (queued) { queued = false; refresh(); }
      });
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 200);
  }

  /* ---------------- live updates from the admin panel ---------------- */

  function connectEvents() {
    /* Netlify's external API proxy does not carry the store's local SSE bus.
       refresh() below polls the shared API every 30 seconds instead. */
  }

  /* ---------------- boot ---------------- */

  function start() {
    booted = true;
    refresh();
    connectEvents();
    /* keep two separately opened portals in sync when SSE is blocked */
    setInterval(refresh, 900000);
    document.addEventListener("focusout", function () {
      if (paintPending) setTimeout(paint, 0);
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh(); /* catch up a backgrounded tab */
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
