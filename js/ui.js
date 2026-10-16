/* ============================================================
   UVID — UI layer
   views: home · listing · product · cart · wishlist
          checkout · payment · orders · account
   ============================================================ */

(function () {
  "use strict";

  var A = window.PT.App;
  var D = window.PT;
  var money = A.money, esc = A.escapeHtml, stars = A.starsHtml;

  var view = $("#view");
  var addressLoadedKey = "";
  var addressPendingKey = "";

  function addressRequest(method, path, body) {
    var options = { method: method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined };
    if (body) options.body = JSON.stringify(body);
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || "Could not save the address.");
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function addressFingerprint(address) {
    return [address.name, address.phone, address.line, address.city, address.pin]
      .map(function (value) { return String(value || "").trim().toLowerCase(); }).join("\u001f");
  }

  function loadSavedAddresses(route) {
    var email = String(A.state.user || "").toLowerCase();
    if (!email) return;
    var key = email + "|" + route;
    if (addressLoadedKey === key || addressPendingKey === key) return;
    addressPendingKey = key;
    addressRequest("GET", "/api/addresses").then(function (data) {
      if (String(A.state.user || "").toLowerCase() !== email) return;
      var serverAddresses = Array.isArray(data.addresses) ? data.addresses : [];
      var fingerprints = {};
      serverAddresses.forEach(function (address) { fingerprints[addressFingerprint(address)] = true; });
      var localAddresses = (A.state.addresses || []).filter(function (address) {
        var fingerprint = addressFingerprint(address);
        if (fingerprints[fingerprint]) return false;
        fingerprints[fingerprint] = true;
        return true;
      });
      A.state.addresses = serverAddresses.concat(localAddresses);
      A.save();
      var session = A.session();
      if (session.addressId) {
        var selected = A.state.addresses.filter(function (address) { return address.id === session.addressId; })[0];
        A.setSession(selected ? { address: selected } : { addressId: null, address: null });
      }
      addressLoadedKey = key;
      rerender();
    }).catch(function (error) {
      addressLoadedKey = key;
      if (error.status === 401) {
        addressLoadedKey = "";
        A.openAuth("login", "Sign in again to load your saved addresses.");
      } else {
        A.toast("Saved addresses could not load from the server. Please refresh and try again.", false);
      }
    }).then(function () {
      if (addressPendingKey === key) addressPendingKey = "";
    });
  }

  function saveAddressToServer(address) {
    return addressRequest("POST", "/api/addresses", address).then(function (data) {
      addressLoadedKey = "";
      return data.address;
    }).catch(function (error) {
      if (error.status === 401) A.openAuth("login", "Sign in to save this address to your account.");
      throw error;
    });
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ================= shared components ================= */

  function productCard(p) {
    var inCart = 0;
    A.state.cart.forEach(function (l) { if (l.id === p.id) inCart = l.qty; });
    var wished = A.inWishlist(p.id);
    return '' +
      '<article class="pcard">' +
      '<a class="pcard__media" href="#/p/' + p.id + '" aria-label="' + esc(p.name) + '">' +
      '<img loading="lazy" src="' + p.img + '" alt="" />' +
      (p.tags.indexOf("deal") > -1 ? '<span class="pcard__flag">Deal</span>' : "") +
      '<button class="pcard__wish' + (wished ? " pcard__wish--on" : "") + '" data-wish="' + p.id + '" aria-label="Toggle wishlist">' +
      '<svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M12 21s-7.5-4.7-10-9.3C.3 8 2.4 4.5 6 4.5c2.2 0 3.6 1.1 4.5 2.6l1.5 2.4 1.5-2.4c.9-1.5 2.3-2.6 4.5-2.6 3.6 0 5.7 3.5 4 7.2C19.5 16.3 12 21 12 21z"/></svg>' +
      '</button></a>' +
      '<div class="pcard__body">' +
      '<p class="pcard__brand">' + esc(p.brand) + '</p>' +
      '<a class="pcard__name" href="#/p/' + p.id + '">' + esc(p.name) + '</a>' +
      (p.rating ? '<div class="rate"><span class="rate__badge">' + p.rating.toFixed(1) + ' <i>★</i></span><span class="rate__count">(' + p.ratingCount.toLocaleString("en-IN") + ')</span></div>' : '<div class="rate rate--new">New</div>') +
      '<div class="pcard__price"><b>' + money(p.price) + '</b>' + (p.discount > 0 ? '<s>' + money(p.mrp) + '</s><em>' + p.discount + '% off</em>' : '') + '</div>' +
      (p.variants && p.variants.length
        ? '<a class="btn btn--soft btn--block" href="#/p/' + p.id + '">Choose a colour</a>'
        : inCart > 0
          ? '<div class="stepper" data-step="' + p.id + '"><button data-qty="dec" data-id="' + p.id + '" aria-label="Decrease">−</button><span>' + inCart + '</span><button data-qty="inc" data-id="' + p.id + '" aria-label="Increase">+</button></div>'
          : '<button class="btn btn--soft btn--block" data-add="' + p.id + '">Add to cart</button>') +
      '</div></article>';
  }

  function statusPill(status) {
    var cls = { "Placed": "blue", "Packed": "amber", "Shipped": "violet", "Out for delivery": "teal", "Delivered": "green", "Cancelled": "red" }[status] || "blue";
    return '<span class="pill pill--' + cls + '">' + esc(status) + '</span>';
  }

  function emptyState(emoji, title, sub, cta) {
    return '<div class="empty"><div class="empty__art">' + emoji + '</div><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p>' + (cta || "") + '</div>';
  }

  function crumbs(items) {
    return '<nav class="crumbs" aria-label="Breadcrumb">' +
      items.map(function (it, i) {
        var last = i === items.length - 1;
        return last ? '<span>' + esc(it.label) + '</span>' : '<a href="' + it.href + '">' + esc(it.label) + '</a>';
      }).join('<i>›</i>') + '</nav>';
  }

  /* ================= HOME ================= */

  function dealCountdown() {
    var now = new Date();
    var end = new Date(now); end.setHours(23, 59, 59, 999);
    var s = Math.max(0, Math.floor((end - now) / 1000));
    var h = String(Math.floor(s / 3600)).padStart(2, "0");
    var m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    var sec = String(s % 60).padStart(2, "0");
    var el = document.getElementById("dealTimer");
    if (el) el.textContent = h + ":" + m + ":" + sec;
  }
  setInterval(dealCountdown, 1000);

  function shelf(title, note, list, href) {
    return '<section class="shelf reveal">' +
      '<div class="shelf__head"><div><h2>' + esc(title) + '</h2>' + (note ? '<p>' + esc(note) + '</p>' : "") + '</div>' +
      (href ? '<a class="shelf__more" href="' + href + '">View all →</a>' : "") + '</div>' +
      '<div class="hgrid">' + list.map(productCard).join("") + '</div></section>';
  }

  function home() {
    var best = D.visibleProducts.slice().sort(function (a, b) { return b.popularity - a.popularity; }).slice(0, 6);
    var deals = D.visibleProducts.filter(function (p) { return p.tags.indexOf("deal") > -1; }).slice(0, 6);
    var newest = D.visibleProducts.slice().sort(function (a, b) { return b.added - a.added; }).slice(0, 6);
    var recent = A.state.recent.filter(function (id) { return id.charAt(0) !== "_" && D.findProduct(id); }).slice(0, 6).map(D.findProduct).filter(function (p) { return p.tags.indexOf("vc-hidden") === -1; });
    var deal = D.visibleProducts.filter(function (p) { return p.discount >= 33; }).sort(function (a, b) { return b.discount - a.discount; })[0] || D.visibleProducts[0];

    view.innerHTML =
      (deal ? '<section class="dealstrip card reveal">' +
      '<div class="dealstrip__info"><p class="kicker">Deal of the day</p>' +
      '<h3>' + esc(deal.name) + '</h3>' +
      '<div class="pcard__price"><b>' + money(deal.price) + '</b><s>' + money(deal.mrp) + '</s><em>' + deal.discount + '% off</em></div>' +
      '<div class="dealstrip__timer">Ends in <b id="dealTimer">--:--:--</b></div>' +
      (deal.variants && deal.variants.length
        ? '<a class="btn btn--primary" href="#/p/' + deal.id + '">Choose a colour</a>'
        : '<button class="btn btn--primary" data-add="' + deal.id + '">Grab the deal</button>') + '</div>' +
      '<img class="dealstrip__img" src="' + deal.img + '" alt="" /></section>' : "") +

      shelf("Bestsellers", "What everyone’s adding to cart", best, "#/search?sort=relevance") +
      shelf("Deals of the week", "Marked down, marked out of stock soon", deals, "#/search?sort=discount") +
      shelf("Just landed", "Fresh arrivals for your desk", newest, "#/search?sort=newest") +
      '<section class="perks reveal">' +
      '<div class="perk"><span>🚚</span><h4>Fast delivery</h4><p>2–4 days metro to metro, tracked end to end.</p></div>' +
      '<div class="perk"><span>🔒</span><h4>UPI QR payment</h4><p>Pay with PhonePe or another UPI app. Orders are confirmed after payment verification.</p></div>' +
      '<div class="perk"><span>🇮🇳</span><h4>Made for India</h4><p>Prices in ₹, GST invoice, support that replies.</p></div>' +
      '</section>' +

      (recent.length ? shelf("Recently viewed", "Pick up where you left off", recent) : "");

    dealCountdown();
  }

  /* ================= LISTING + FILTERS ================= */

  function listingQuery() {
    var h = location.hash || "#/";
    var qs = h.split("?")[1] || "";
    var q = {};
    qs.split("&").forEach(function (kv) {
      if (!kv) return;
      var p = kv.split("=");
      q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
    });
    return q;
  }
  function currentBase() { return (location.hash || "#/").split("?")[0]; }
  function navigateQuery(q) {
    var parts = [];
    for (var k in q) if (q[k] !== undefined && q[k] !== "" && q[k] !== null) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k]));
    A.navigateTo(currentBase() + (parts.length ? "?" + parts.join("&") : ""));
  }
  function toggleFilter(key, val, checked, single) {
    var q = listingQuery();
    if (single) { q[key] = checked ? val : ""; }
    else {
      var cur = q[key] ? q[key].split("|") : [];
      var i = cur.indexOf(val);
      if (checked && i === -1) cur.push(val);
      if (!checked && i > -1) cur.splice(i, 1);
      q[key] = cur.join("|");
    }
    navigateQuery(q);
  }

  function searchProducts(term) {
    var t = term.toLowerCase();
    return D.PRODUCTS.filter(function (p) {
      return (p.name + " " + p.brand + " " + p.category + " " + (p.tags.join(" "))).toLowerCase().indexOf(t) !== -1;
    });
  }

  function visibleBase(list) { return (list || D.PRODUCTS).filter(function (p) { return p.tags.indexOf("vc-hidden") === -1; }); }

  function filteredProducts() {
    var q = listingQuery();
    var base;
    var path = currentBase();
    if (path.indexOf("#/c/") === 0) {
      var slug = path.split("/")[2];
      base = D.PRODUCTS.filter(function (p) { return p.category === slug && p.tags.indexOf("vc-hidden") === -1; });
    } else {
      base = q.q ? searchProducts(q.q) : D.PRODUCTS.slice();
      base = visibleBase(base);
    }
    var cats = q.cat ? q.cat.split("|") : [];
    var brands = q.brand ? q.brand.split("|") : [];
    var price = q.price || "";
    var rating = q.rating ? parseFloat(q.rating) : 0;
    var disc = q.disc ? parseInt(q.disc, 10) : 0;

    var out = base.filter(function (p) {
      if (cats.length && cats.indexOf(p.category) === -1) return false;
      if (brands.length && brands.indexOf(p.brand) === -1) return false;
      if (price === "u100" && p.price > 100) return false;
      if (price === "100-250" && !(p.price >= 100 && p.price <= 250)) return false;
      if (price === "250-500" && !(p.price > 250 && p.price <= 500)) return false;
      if (price === "o500" && p.price <= 500) return false;
      if (rating && p.rating < rating) return false;
      if (disc && p.discount < disc) return false;
      return true;
    });

    var sort = q.sort || "relevance";
    var sorters = {
      "price-asc": function (a, b) { return a.price - b.price; },
      "price-desc": function (a, b) { return b.price - a.price; },
      "rating": function (a, b) { return b.rating - a.rating; },
      "discount": function (a, b) { return b.discount - a.discount; },
      "newest": function (a, b) { return b.added - a.added; },
      "relevance": function (a, b) { return b.popularity - a.popularity; }
    };
    out.sort(sorters[sort] || sorters.relevance);
    return out;
  }

  function checkboxRow(key, val, label, count) {
    var q = listingQuery();
    var cur = q[key] ? q[key].split("|") : [];
    var on = cur.indexOf(String(val)) !== -1;
    return '<label class="fcheck"><input type="checkbox" data-filter="' + key + '" data-val="' + esc(String(val)) + '"' + (on ? " checked" : "") + ' />' +
      '<span>' + esc(label) + '</span>' + (count !== undefined ? '<em>' + count + '</em>' : "") + '</label>';
  }
  function radioRow(key, val, label, on) {
    return '<label class="fcheck"><input type="radio" name="f_' + key + '" data-filter="' + key + '" data-val="' + esc(String(val)) + '" data-single="1"' + (on ? " checked" : "") + ' /><span>' + esc(label) + '</span></label>';
  }

  function filterPanel(products) {
    var q = listingQuery();
    var brandCounts = {};
    products.forEach(function (p) { brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1; });
    var brands = Object.keys(brandCounts).sort();
    var catsIn = {};
    products.forEach(function (p) { catsIn[p.category] = (catsIn[p.category] || 0) + 1; });
    var anyFilter = q.cat || q.brand || q.price || q.rating || q.disc;

    return '<aside class="filters" id="filterPanel">' +
      '<div class="filters__head"><h3>Filters</h3>' +
      (anyFilter ? '<button class="linkbtn" data-clearfilters>Clear all</button>' : "") + '</div>' +
      '<div class="filters__group"><h4>Price</h4>' +
      radioRow("price", "", "All", !q.price) +
      radioRow("price", "u100", "Under ₹100", q.price === "u100") +
      radioRow("price", "100-250", "₹100 – ₹250", q.price === "100-250") +
      radioRow("price", "250-500", "₹250 – ₹500", q.price === "250-500") +
      radioRow("price", "o500", "Over ₹500", q.price === "o500") + '</div>' +
      '<div class="filters__group"><h4>Discount</h4>' +
      radioRow("disc", "", "Any", !q.disc) +
      radioRow("disc", "20", "20% or more", q.disc === "20") +
      radioRow("disc", "30", "30% or more", q.disc === "30") +
      radioRow("disc", "40", "40% or more", q.disc === "40") + '</div>' +
      '<div class="filters__group"><h4>Customer rating</h4>' +
      radioRow("rating", "", "Any", !q.rating) +
      radioRow("rating", "4.5", "4.5★ & above", q.rating === "4.5") +
      radioRow("rating", "4", "4★ & above", q.rating === "4") +
      radioRow("rating", "3", "3★ & above", q.rating === "3") + '</div>' +
      (brands.length > 1
        ? '<div class="filters__group"><h4>Brand</h4>' + brands.map(function (b) {
            return checkboxRow("brand", b, b, brandCounts[b]);
          }).join("") + '</div>' : "") +
      '<div class="filters__group"><h4>Category</h4>' +
      D.CATEGORIES.map(function (c) {
        if (!catsIn[c.slug]) return "";
        return checkboxRow("cat", c.slug, c.emoji + " " + c.label, catsIn[c.slug]);
      }).join("") + '</div>' +
      '</aside>';
  }

  function listing() {
    var q = listingQuery();
    var path = currentBase();
    var items = filteredProducts();
    var sort = q.sort || "relevance";
    var title, crumbTrail;

    if (path.indexOf("#/c/") === 0) {
      var cat = D.categoryBySlug(path.split("/")[2]);
      if (!cat) { home(); return; }
      title = cat.label;
      crumbTrail = [{ label: "Home", href: "#/" }, { label: cat.label, href: "#/c/" + cat.slug }];
    } else {
      title = q.q ? 'Results for “' + q.q + '”' : "All products";
      crumbTrail = [{ label: "Home", href: "#/" }, { label: q.q ? "Search" : "All products", href: "#/search" }];
    }

    var sortOpts = [["relevance", "Popularity"], ["price-asc", "Price — low to high"], ["price-desc", "Price — high to low"], ["rating", "Customer rating"], ["discount", "Discount"], ["newest", "Newest first"]];
    var sortSel = '<label class="sortbox">Sort <select id="sortSel">' +
      sortOpts.map(function (o) { return '<option value="' + o[0] + '"' + (sort === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") +
      '</select></label>';

    view.innerHTML =
      crumbs(crumbTrail) +
      '<div class="listing">' +
      filterPanel(items) +
      '<section class="results">' +
      '<header class="results__head">' +
      '<div><h1>' + esc(title) + '</h1><p>' + items.length + ' item' + (items.length === 1 ? "" : "s") + ' found</p></div>' + sortSel +
      '</header>' +
      '<button class="btn btn--ghost btn--block filters__mob" id="openFilters">⚙ Filters & sort</button>' +
      (items.length
        ? '<div class="grid">' + items.map(productCard).join("") + '</div>'
        : emptyState("🔍", "Nothing matched", "Try removing a filter or searching for something else.",
          '<a class="btn btn--primary" href="#/search">Browse everything</a>')) +
      '</section></div>';

    $("#sortSel").addEventListener("change", function () { toggleFilter("sort", this.value, true, true); });
    $("#openFilters").addEventListener("click", function () {
      var p = $("#filterPanel");
      p.classList.add("filters--open");
      $("#backdrop").classList.add("backdrop--show");
    });
  }

  /* ================= PRODUCT DETAIL ================= */

  function ratingBars(rating) {
    var p5 = Math.min(85, Math.max(8, Math.round((rating - 3.1) * 40)));
    var rest = 100 - p5;
    var p4 = Math.round(rest * 0.45), p3 = Math.round(rest * 0.25), p2 = Math.round(rest * 0.15), p1 = Math.max(0, 100 - p5 - p4 - p3 - p2);
    return [[5, p5], [4, p4], [3, p3], [2, p2], [1, p1]].map(function (r) {
      return '<div class="rbar"><span>' + r[0] + '★</span><div class="rbar__track"><div class="rbar__fill" style="width:' + r[1] + '%"></div></div><em>' + r[1] + '%</em></div>';
    }).join("");
  }

  /* gallery thumbnails for one colour (or the product itself) */
  function thumbHtml(rec, active) {
    var imgs = (rec && rec.images && rec.images.length)
      ? rec.images
      : [{ id: null, url: rec ? rec.img : "", altText: rec ? rec.name : "" }];
    return imgs.map(function (im, i) {
      return '<button type="button" class="pdp__thumb' + (i === (active || 0) ? " pdp__thumb--on" : "") +
        '" data-thumb="' + i + '" data-thumburl="' + esc(im.url) + '" aria-label="Photo ' + (i + 1) + '">' +
        '<img src="' + esc(im.url) + '" alt="' + esc(im.altText || "") + '" /></button>';
    }).join("");
  }

  function productPage(id, query) {
    var mainId = id;
    if (D.legacyProductRedirect[id]) { A.navigateTo("#/p/" + D.legacyProductRedirect[id] + ((location.hash || "").split("?")[1] ? "?" + (location.hash || "").split("?")[1] : "")); return; }
    var p = D.findProduct(id);
    if (!p) { view.innerHTML = emptyState("🤷", "Product not found", "It may have been removed.", '<a class="btn btn--primary" href="#/">Back to home</a>'); return; }
    if (p.tags.indexOf("vc-hidden") > -1) { mainId = p.parent; p = D.findProduct(p.parent) || p; }
    var mainP = p;
    var selectedVariant = null;
    if (mainP.variants && mainP.variants.length) {
      selectedVariant = (query && query.v ? mainP.variants.filter(function (v) { return v.size === query.v || v.label === query.v; })[0] : null) || mainP.variants[0];
      p = D.findProduct(selectedVariant.id) || p;
    }
    var hasVariants = !!(mainP.variants && mainP.variants.length);
    A.pushRecent && A.pushRecent(mainId);
    var reviews = D.reviewsFor(id);
    var wished = A.inWishlist(mainId);
    var cat = D.categoryBySlug(p.category);
    var eta = new Date(); eta.setDate(eta.getDate() + 4);
    var etaStr = eta.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
    var similar = D.visibleProducts.filter(function (x) { return x.category === p.category && x.id !== mainId; })
      .concat(D.visibleProducts.filter(function (x) { return x.category !== p.category && x.tags.indexOf("bestseller") > -1; }))
      .slice(0, 6);
    var inCart = 0;
    A.state.cart.forEach(function (l) { if (l.id === p.id) inCart = l.qty; });
    var specSource = hasVariants ? mainP.specs : p.specs;
    var specRows = Object.keys(specSource).map(function (k) {
      return '<tr><th>' + esc(k) + '</th><td>' + esc(specSource[k]) + '</td></tr>';
    }).join("");
    var variantLabel = hasVariants ? mainP.name + " — " + (selectedVariant.label || p.name) : p.name;

    view.innerHTML =
      crumbs([{ label: "Home", href: "#/" }, { label: cat.label, href: "#/c/" + cat.slug }, { label: variantLabel }]) +
      '<div class="pdp">' +
      '<section class="pdp__gallery card">' +
      '<div class="pdp__imgwrap"><img id="pdpImg" src="' + p.img + '" alt="' + esc(variantLabel) + '" /></div>' +
      (hasVariants
        ? '<div class="pdp__colours" role="group" aria-label="Colour"><span class="pdp__colourslabel">Colour</span>' +
          mainP.variants.map(function (v) {
            return '<button type="button" class="pdp__swatch' + (p.id === v.id ? " pdp__swatch--on" : "") + '" data-vcsize="' + esc(v.size) + '" data-vcid="' + v.id + '" aria-pressed="' + (p.id === v.id) + '">' +
              '<img src="' + v.img + '" alt="" />' + esc(v.label) + "</button>";
          }).join("") + "</div>"
        : "") +
      '<div class="pdp__thumbs" id="pdpThumbs">' + thumbHtml(p, 0) + "</div>" +
      '<div class="pdp__actions">' +
      (inCart > 0 && !hasVariants
        ? '<a class="btn btn--ghost" href="#/cart">Go to cart →</a>'
        : '<button class="btn btn--ghost" data-add="' + p.id + '" data-root="' + mainId + '">🛒 Add to cart</button>') +
      '<button class="btn btn--primary" data-buy="' + p.id + '" data-root="' + mainId + '">⚡ Buy now</button>' +
      '</div></section>' +

      '<section class="pdp__info">' +
      '<p class="pdp__brand"><a href="#/search?q=' + encodeURIComponent(p.brand) + '">' + esc(p.brand) + '</a></p>' +
      '<h1 id="pdpTitle">' + esc(variantLabel) + '</h1>' +
      (p.rating
        ? '<div class="pdp__ratingrow"><span class="rate__badge rate__badge--lg">' + p.rating.toFixed(1) + ' <i>★</i></span>' +
          '<span class="rate__count">' + p.ratingCount.toLocaleString("en-IN") + ' ratings & ' + reviews.length + ' reviews</span>' +
          (p.tags.indexOf("bestseller") > -1 ? '<span class="pill pill--amber">Bestseller</span>' : "") + '</div>'
        : '<div class="pdp__ratingrow"><span class="pill pill--green">New</span><span class="rate__count">Just launched — no ratings yet</span></div>') +
      '<div class="pdp__priceblock">' +
      '<div class="pdp__price"><b id="pdpPrice">' + money(p.price) + '</b>' + (p.discount > 0 ? '<s>' + money(p.mrp) + '</s><em class="off">' + p.discount + '% off</em>' : '') + '</div>' +
      '<p class="pdp__tax">Inclusive of all taxes</p></div>' +
      '<div class="pdp__delivery card-inset">' +
      '<p>🚚 Delivery by <b>' + etaStr + '</b> · Delivery charge confirmed after address review</p>' +
      '<p>' + (p.stock <= 20 ? "⚡ Hurry! Only " + p.stock + " left in stock" : "✅ In stock — ships in 24 hrs") + '</p>'.replace("<p>", "<p id='pdpStockBadge'>") +
      '<p>📱 Pay by UPI QR</p></div>' +
      '<div class="pdp__wishrow">' +
      '<button class="heartbtn' + (wished ? " heartbtn--on" : "") + '" data-wish="' + mainId + '">' + (wished ? "♥ Wishlisted" : "♡ Add to wishlist") + '</button>' +
      '</div>' +
      '<div class="pdp__section"><h3>Highlights</h3><ul class="ticks">' +
      p.highlights.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join("") + '</ul></div>' +
      '<div class="pdp__section"><h3>Specifications</h3><table class="specs">' + specRows + '</table></div>' +
      (p.rating
        ? '<div class="pdp__section"><h3>Ratings & reviews</h3>' +
          '<div class="revsum"><div class="revsum__score"><b>' + p.rating.toFixed(1) + '</b><span>' + stars(p.rating) + '</span><em>' + p.ratingCount.toLocaleString("en-IN") + ' ratings</em></div>' +
          '<div class="revsum__bars">' + ratingBars(p.rating) + '</div></div>' +
          '<div class="revlist">' + reviews.map(function (r) {
            return '<article class="rev"><header><span class="rev__name">' + esc(r.name) + '</span>' +
              '<span class="rate__badge">' + r.stars + ' <i>★</i></span>' +
              (r.verified ? '<span class="pill pill--green pill--xs">Verified</span>' : "") +
              '<time>' + esc(r.date) + '</time></header>' +
              '<h4>' + esc(r.head) + '</h4><p>' + esc(r.body) + '</p></article>';
          }).join("") + '</div></div>'
        : '<div class="pdp__section"><h3>Ratings & reviews</h3><p class="revempty">Be the first to review this product.</p></div>') +
      '</section></div>' +
      shelf("Similar products", "You might also like", similar);

    /* thumbnails: swap the main photo (works for both plain and colour products) */
    var thumbs = $("#pdpThumbs");
    if (thumbs) {
      thumbs.addEventListener("click", function (e) {
        var b = e.target.closest(".pdp__thumb");
        if (!b) return;
        $$(".pdp__thumb", thumbs).forEach(function (x) { x.classList.remove("pdp__thumb--on"); });
        b.classList.add("pdp__thumb--on");
        var img = $("#pdpImg");
        if (img) img.src = b.getAttribute("data-thumburl");
      });
    }

    if (hasVariants) {
      var pdpState = { id: p.id };
      $$(".pdp__swatch").forEach(function (b) {
        b.addEventListener("click", function () {
          var vid = b.getAttribute("data-vcid");
          if (vid === pdpState.id) return;
          var rec = D.findProduct(vid);
          if (!rec) return;
          var option = mainP.variants.filter(function (v) { return v.id === vid; })[0];
          var optionLabel = option ? option.label : rec.name.split(" — ").slice(1).join(" — ");
          var optionTitle = mainP.name + " — " + (optionLabel || rec.name);
          pdpState.id = rec.id;
          $$(".pdp__swatch").forEach(function (x) { x.classList.remove("pdp__swatch--on"); x.setAttribute("aria-pressed", "false"); });
          b.classList.add("pdp__swatch--on");
          b.setAttribute("aria-pressed", "true");
          var img = $("#pdpImg"); if (img) { img.src = rec.img; img.alt = rec.name; }
          /* show this colour's own photos from the image database */
          if (thumbs) { thumbs.innerHTML = thumbHtml(rec, 0); }
          var price = $(".pdp__price");
          if (price) price.innerHTML = '<b id="pdpPrice">' + money(rec.price) + '</b>' + (rec.discount > 0 ? '<s>' + money(rec.mrp) + '</s><em class="off">' + rec.discount + '% off</em>' : '');
          var ttl = $("#pdpTitle"); if (ttl) ttl.textContent = optionTitle;
          var cr = $(".crumbs span:last-child"); if (cr) cr.textContent = optionTitle;
          $$('#view [data-root="' + mainId + '"]').forEach(function (btn) {
            if (btn.hasAttribute("data-add")) btn.setAttribute("data-add", rec.id);
            if (btn.hasAttribute("data-buy")) btn.setAttribute("data-buy", rec.id);
          });
          var badge = $("#pdpStockBadge");
          if (badge) badge.innerHTML = esc(rec.stock <= 20 ? "⚡ Hurry! Only " + rec.stock + " left in stock" : "✅ In stock — ships in 24 hrs");
        });
      });
    }
  }

  /* ================= CART ================= */

  /* drop cart lines whose product no longer exists (archived/deleted) */
  function pruneMissingCart() {
    var before = A.state.cart.length;
    var kept = A.state.cart.filter(function (l) { return !!D.findProduct(l.id); });
    if (kept.length !== before) {
      A.state.cart = kept;
      A.save();
      A.renderChrome();
    }
  }

  function cartPage() {
    pruneMissingCart();
    var t = A.computeTotals();
    if (t.count === 0) {
      view.innerHTML = emptyState("🛒", "Your cart is empty", "Fill it with pens, paper & pretty things.",
        '<a class="btn btn--primary" href="#/">Start shopping</a>');
      return;
    }
    var saved = A.state.cart.reduce(function (sum, l) {
      var p = D.findProduct(l.id); return sum + (p ? (p.mrp - p.price) * l.qty : 0);
    }, 0);

    var lines = A.state.cart.map(function (l) {
      var p = D.findProduct(l.id);
      var wished = A.inWishlist(p.id);
      return '<article class="cline">' +
        '<a class="cline__img" href="#/p/' + p.id + '"><img src="' + p.img + '" alt="" /></a>' +
        '<div class="cline__body">' +
        '<a class="cline__name" href="#/p/' + p.id + '">' + esc(p.name) + '</a>' +
        '<p class="cline__seller">' + esc(p.brand) + ' · ' + (p.stock <= 20 ? "Only " + p.stock + " left" : "In stock") + '</p>' +
        '<div class="cline__price"><b>' + money(p.price * l.qty) + '</b>' + (p.discount > 0 ? '<s>' + money(p.mrp * l.qty) + '</s><em>' + p.discount + '% off</em>' : '') + '</div>' +
        '<div class="cline__ops">' +
        '<div class="stepper"><button data-qty="dec" data-id="' + p.id + '" aria-label="Decrease">−</button><span>' + l.qty + '</span><button data-qty="inc" data-id="' + p.id + '" aria-label="Increase">+</button></div>' +
        '<button class="linkbtn" data-savelater="' + p.id + '">' + (wished ? "♥ Saved" : "♡ Save for later") + '</button>' +
        '<button class="linkbtn linkbtn--danger" data-remove="' + p.id + '">Remove</button>' +
        '</div></div></article>';
    }).join("");

    view.innerHTML =
      crumbs([{ label: "Home", href: "#/" }, { label: "Cart" }]) +
      '<div class="cartpage">' +
      '<section class="cartpage__main">' +
      '<header class="cartpage__head"><h1>Shopping cart <span>(' + t.count + ' item' + (t.count === 1 ? "" : "s") + ')</span></h1>' +
      '<button class="linkbtn linkbtn--danger" data-clearcart>Clear cart</button></header>' +
      lines +
      '</section>' +

      '<aside class="cartpage__side">' +
      '<div class="pricedtl card"><h3>Price details</h3>' +
      '<div class="prow"><span>Price (' + t.count + ' item' + (t.count === 1 ? "" : "s") + ')</span><b>' + money(t.mrpTotal) + '</b></div>' +
      (t.mrpTotal - t.subtotal > 0 ? '<div class="prow prow--green"><span>Product discount</span><b>− ' + money(t.mrpTotal - t.subtotal) + '</b></div>' : "") +
      '<div class="prow"><span>Delivery</span><b>Confirmed after address review</b></div>' +
      '<div class="prow prow--total"><span>Items subtotal</span><b>' + money(t.subtotal) + '</b></div>' +
      '<p class="safe-note">The store will add the delivery charge after reviewing your address. You will see the final total before paying.</p>' +
      (t.mrpTotal - t.subtotal > 0 ? '<p class="prow--save">You save <b>' + money(t.mrpTotal - t.subtotal) + '</b> on this order 🎉</p>' : "") +
      '<button class="btn btn--primary btn--block btn--lg" id="toCheckout">Place order →</button>' +
      '<p class="safe-note">🔒 Safe and secure payments</p>' +
      '</div></aside></div>';

    $("#toCheckout").addEventListener("click", function () {
      if (!A.requireLogin("Login to checkout.")) return;
      A.navigateTo("#/checkout");
    });
  }

  /* ================= WISHLIST ================= */

  function wishlistPage() {
    var items = A.state.wishlist.map(D.findProduct).filter(Boolean);
    if (items.length === 0) {
      view.innerHTML = emptyState("💔", "Your wishlist is empty", "Tap the ♥ on any product to save it here.",
        '<a class="btn btn--primary" href="#/">Discover products</a>');
      return;
    }
    view.innerHTML =
      crumbs([{ label: "Home", href: "#/" }, { label: "Wishlist" }]) +
      '<div class="wishpage"><header class="results__head"><div><h1>My wishlist <span>(' + items.length + ')</span></h1><p>Your saved favourites, one tap from the cart</p></div></header>' +
      '<div class="grid">' + items.map(function (p) {
        var card = productCard(p);
        return card.replace('</div></article>', '<button class="linkbtn linkbtn--danger wishpage__rm" data-removefromwish="' + p.id + '">Remove</button></div></article>');
      }).join("") + '</div></div>';
  }

  /* ================= CHECKOUT ================= */

  function addressFormHtml(prefix) {
    return '<form class="addr-form" id="' + prefix + 'Form" novalidate>' +
      '<div class="field-row">' +
      '<div class="field"><label for="' + prefix + 'Name">Full name</label><input id="' + prefix + 'Name" placeholder="e.g. Priya Sharma" required /></div>' +
      '<div class="field"><label for="' + prefix + 'Phone">Phone</label><input id="' + prefix + 'Phone" inputmode="numeric" maxlength="10" placeholder="10-digit mobile" required /></div>' +
      '</div>' +
      '<div class="field"><label for="' + prefix + 'Line">Flat, house no., building, street</label><input id="' + prefix + 'Line" placeholder="House 12, Paper Lane" required /></div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="' + prefix + 'City">City</label><input id="' + prefix + 'City" placeholder="City" required /></div>' +
      '<div class="field field--sm"><label for="' + prefix + 'Pin">PIN code</label><input id="' + prefix + 'Pin" inputmode="numeric" maxlength="6" placeholder="6-digit PIN" required /></div>' +
      '</div>' +
      '<p class="form-error" id="' + prefix + 'Err" hidden></p>' +
      '<button type="submit" class="btn btn--primary btn--sm">Save address</button>' +
      '</form>';
  }

  function readAddressForm(prefix) {
    var g = function (sfx) { return $("#" + prefix + sfx).value.trim(); };
    var name = g("Name"), phone = g("Phone").replace(/\D/g, ""), line = g("Line"), city = g("City"), pin = g("Pin").replace(/\D/g, "");
    if (name.length < 2) return { err: "Please enter your full name." };
    if (phone.length !== 10) return { err: "Phone must be 10 digits." };
    if (line.length < 5) return { err: "Address looks too short." };
    if (!city) return { err: "Please enter your city." };
    if (pin.length !== 6) return { err: "PIN must be 6 digits." };
    return { addr: { id: A.uid("adr"), name: name, phone: phone, line: line, city: city, pin: pin } };
  }

  function checkoutPage() {
    pruneMissingCart();
    var t = A.computeTotals();
    if (t.count === 0) { A.navigateTo("#/cart"); return; }
    var s = A.session();
    var addresses = A.state.addresses;
    var selected = s.addressId || (addresses[0] ? addresses[0].id : null);
    if (selected && !s.address) {
      var a0 = addresses.filter(function (x) { return x.id === selected; })[0];
      if (a0) A.setSession({ address: a0 });
    }

    A.setSession({ paymentMethod: "UPI", cardNum: null, cardExp: null, cardName: null });

    var addrBlock;
    if (addresses.length === 0) {
      addrBlock = '<div class="addr-new card"><h3>📦 Add a delivery address</h3>' + addressFormHtml("addr") + '</div>';
    } else {
      addrBlock = '<div class="addr-list">' + addresses.map(function (a) {
        var on = a.id === selected;
        return '<label class="addr card-inset' + (on ? " addr--on" : "") + '">' +
          '<input type="radio" name="addrSel" value="' + a.id + '"' + (on ? " checked" : "") + ' />' +
          '<span class="addr__body"><b>' + esc(a.name) + '</b> · ' + esc(a.phone) +
          '<span>' + esc(a.line) + ', ' + esc(a.city) + ' — ' + esc(a.pin) + '</span></span>' +
          (on ? '<em class="addr__tag">Delivering here</em>' : "") + '</label>';
      }).join("") +
        '<button class="btn btn--ghost btn--sm" id="addAddrBtn">+ Add new address</button></div>' +
        '<div class="addr-new card" id="addrNewWrap" hidden><h3>📦 New address</h3>' + addressFormHtml("addr2") + '</div>';
    }

    var orderItems = A.state.cart.map(function (l) {
      var p = D.findProduct(l.id);
      return '<div class="mini"><img src="' + p.img + '" alt="" /><span>' + esc(p.name) + '</span><b>×' + l.qty + '</b></div>';
    }).join("");

    view.innerHTML =
      crumbs([{ label: "Home", href: "#/" }, { label: "Cart", href: "#/cart" }, { label: "Checkout" }]) +
      '<div class="checkoutpage">' +
      '<div class="stepsbar"><span class="step step--done">🛒 Cart</span><i>→</i><span class="step step--on">📍 Address & payment</span><i>→</i><span class="step">✅ Done</span></div>' +
      '<div class="checkoutgrid">' +
      '<section class="checkoutmain">' +
      '<div class="cbox card"><h2><span class="cbox__num">1</span> Delivery address</h2>' + addrBlock + '</div>' +
      '<div class="cbox card"><h2><span class="cbox__num">2</span> Order summary</h2>' +
      '<div class="minis">' + orderItems + '</div>' +
      '<button class="linkbtn" id="backToCart">← Edit cart</button></div>' +
      '<div class="cbox card"><h2><span class="cbox__num">3</span> UPI QR payment</h2>' +
      '<div class="upi-checkout">' +
      '<div class="payopt payopt--on"><span class="payopt__icon">📱</span><span class="payopt__body"><b>Pay by UPI QR</b><span>Scan with PhonePe or another UPI app. Payment is checked before your order is confirmed.</span></span></div>' +
      '<p class="upi-setup" id="upiQrSetup" role="status">Checking whether the store UPI QR has been added…</p>' +
      '<img class="upi-preflight" id="upiQrPreflight" src="/assets/upi-qr.png" alt="" aria-hidden="true" />' +
      '</div></div>' +
      '</section>' +
      '<aside class="checkouts"><div class="pricedtl card"><h3>Price details</h3>' +
      '<div class="prow"><span>Amount (' + t.count + ' item' + (t.count === 1 ? "" : "s") + ')</span><b>' + money(t.mrpTotal) + '</b></div>' +
      (t.mrpTotal - t.subtotal > 0 ? '<div class="prow prow--green"><span>Discounts</span><b>− ' + money(t.mrpTotal - t.subtotal) + '</b></div>' : "") +
      '<div class="prow"><span>Delivery</span><b>Confirmed after address review</b></div>' +
      '<div class="prow prow--total"><span>Items subtotal</span><b>' + money(t.subtotal) + '</b></div>' +
      '<p class="safe-note">The store will set your delivery charge after reviewing the address. You can pay once the final total is ready.</p>' +
      '<button class="btn btn--primary btn--block btn--lg" id="placeOrder" disabled>UPI QR not ready</button>' +
      '<p class="safe-note">Your order is confirmed only after UPI payment is verified.</p>' +
      '</div></aside></div></div>';

    $("#backToCart").addEventListener("click", function () { A.navigateTo("#/cart"); });

    $$('.addr-list input[name="addrSel"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var a = addresses.filter(function (x) { return x.id === r.value; })[0];
        A.setSession({ addressId: r.value, address: a });
        rerender();
      });
    });

    var addBtn = $("#addAddrBtn");
    if (addBtn) addBtn.addEventListener("click", function () {
      var w = $("#addrNewWrap");
      w.hidden = !w.hidden;
    });

    ["addr", "addr2"].forEach(function (pf) {
      var f = $("#" + pf + "Form");
      if (!f) return;
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        var res = readAddressForm(pf);
        var err = $("#" + pf + "Err");
        if (res.err) { err.textContent = res.err; err.hidden = false; return; }
        err.hidden = true;
        try {
          var savedAddress = await saveAddressToServer(res.addr);
          A.state.addresses.unshift(savedAddress);
          A.save();
          A.setSession({ addressId: savedAddress.id, address: savedAddress });
          A.toast("Address saved to your account", true);
          rerender();
        } catch (error) {
          err.textContent = error.message || "Could not save your address. Please try again.";
          err.hidden = false;
        }
      });
    });

    var qrProbe = $("#upiQrPreflight");
    var placeButton = $("#placeOrder");
    var qrSetup = $("#upiQrSetup");
    function setQrReady(ready) {
      if (ready) {
        placeButton.disabled = false;
        placeButton.textContent = "Place order · delivery confirmed next";
        qrSetup.textContent = "UPI QR is ready. The store will confirm delivery before you pay.";
        qrSetup.classList.add("upi-setup--ready");
      } else {
        placeButton.disabled = true;
        placeButton.textContent = "UPI QR not ready";
        qrSetup.textContent = "The store has not added its UPI QR yet. Checkout will be available once assets/upi-qr.png is added.";
        qrSetup.classList.remove("upi-setup--ready");
      }
    }
    qrProbe.addEventListener("load", function () { setQrReady(true); });
    qrProbe.addEventListener("error", function () { setQrReady(false); });
    if (qrProbe.complete) setQrReady(qrProbe.naturalWidth > 0);

    $("#placeOrder").addEventListener("click", function () {
      if (placeButton.disabled) return;
      if (!A.session().address) { A.toast("Add a delivery address first.", false); window.scrollTo(0, 0); return; }
      Promise.resolve(A.placeOrder("UPI")).then(function (order) {
        if (order) A.navigateTo("#/pay/" + order.id);
      });
    });
  }

  /* ================= PAYMENT / SUCCESS ================= */

  function paymentPage(orderId) {
    var order = A.state.orders.filter(function (o) { return o.id === orderId; })[0];
    if (!order) { view.innerHTML = emptyState("🧾", "Order not found", "", '<a class="btn btn--primary" href="#/">Home</a>'); return; }
    if (order.status === "Cancelled") { view.innerHTML = emptyState("↩️", "Order cancelled", "This order is cancelled. Contact the store if you already transferred payment.", '<a class="btn btn--primary" href="#/orders">My orders</a>'); return; }

    var isCod = String(order.payment).toLowerCase() === "cod";
    if (order._srv && isCod) { successHtml(order); return; }
    if (!order._srv) {
      view.innerHTML = emptyState("🔒", "Payment needs server verification", "This order cannot be marked successful from browser-only data. Please return to checkout and use the store's UPI payment flow.", '<a class="btn btn--primary" href="#/checkout">Return to checkout</a>');
      return;
    }

    if (!order.shippingFinalized) {
      view.innerHTML = '<div class="paywait card upi-wait"><h1>Order ' + esc(order.id) + ' received</h1>' +
        '<p>The store is checking your address and will add the delivery charge. This page will show the final amount and UPI QR when it is ready.</p>' +
        '<p class="upi-wait__status" id="upiPaymentStatus" role="status">Waiting for the store to confirm delivery.</p>' +
        '<div class="success__cta"><a class="btn btn--ghost" href="#/orders/' + encodeURIComponent(order.id) + '">View order status</a><button class="btn btn--ghost" type="button" data-cancel="' + esc(order.id) + '">Cancel unpaid order</button></div></div>';
    } else {
      view.innerHTML = '<div class="paywait card upi-wait"><h1>Complete your UPI payment</h1>' +
        '<p>Scan this UPI QR and pay the exact amount below. Add the order number as the payment note if your UPI app allows it.</p>' +
        '<div class="upi-wait__qr"><img id="upiPaymentQr" src="/assets/upi-qr.png" alt="UVID UPI payment QR code" /><p id="upiPaymentQrError" hidden>The UPI QR could not be loaded. Please contact the store before paying.</p></div>' +
        '<div class="upi-wait__amount"><span>Order ' + esc(order.id) + '</span><b>' + money(order.totals.total) + '</b></div>' +
        '<p class="upi-wait__status" id="upiPaymentStatus" role="status">Payment awaiting verification. The order is not confirmed yet.</p>' +
        '<p class="safe-note">After paying, keep this page open. UVID will show the success message after the payment is verified in PhonePe Business.</p>' +
        '<div class="success__cta"><a class="btn btn--ghost" href="#/orders/' + encodeURIComponent(order.id) + '">View order status</a><button class="btn btn--ghost" type="button" data-cancel="' + esc(order.id) + '">Cancel unpaid order</button></div></div>';
      var qr = $("#upiPaymentQr");
      qr.addEventListener("error", function () { qr.hidden = true; $("#upiPaymentQrError").hidden = false; });
    }
    function checkPaymentStatus() {
      var statusEl = $("#upiPaymentStatus");
      if (!statusEl) { clearInterval(paymentTimer); return; }
      fetch("/api/orders/" + encodeURIComponent(order.id), { cache: "no-store", credentials: "same-origin" })
        .then(function (res) { if (!res.ok) throw new Error("Could not refresh payment status."); return res.json(); })
        .then(function (data) {
          var serverOrder = data && data.order;
          if (!serverOrder) return;
          if (Number(serverOrder.shipping_finalized) !== 0 && !order.shippingFinalized) {
            order.shippingFinalized = true;
            order.totals.shipping = Number(serverOrder.shipping) || 0;
            order.totals.total = Number(serverOrder.total_amount) || 0;
            order.paymentStatus = "Awaiting payment verification";
            A.save();
            clearInterval(paymentTimer);
            paymentPage(order.id);
            return;
          }
          if (serverOrder.payment_status === "PAID") {
            order.paymentConfirmed = true;
            order.paymentStatus = "Paid ✓";
            order.processed = true;
            A.save();
            clearInterval(paymentTimer);
            successHtml(order);
            return;
          }
          if (serverOrder.status === "CANCELLED") {
            order.status = "Cancelled";
            A.save();
            statusEl.textContent = "This order was cancelled. Contact the store if you already transferred payment.";
            statusEl.classList.add("upi-wait__status--error");
            clearInterval(paymentTimer);
            return;
          }
          order.shippingFinalized = Number(serverOrder.shipping_finalized) !== 0;
          order.totals.shipping = Number(serverOrder.shipping) || 0;
          order.totals.total = Number(serverOrder.total_amount) || 0;
          order.paymentStatus = order.shippingFinalized ? "Awaiting payment verification" : "Delivery charge awaiting store quote";
          statusEl.textContent = order.shippingFinalized ? "Payment awaiting verification. The order is not confirmed yet." : "Waiting for the store to confirm delivery.";
          A.save();
        })
        .catch(function () { statusEl.textContent = "Still waiting for the store server. This page will check again."; });
    }
    var paymentTimer = setInterval(checkPaymentStatus, 5000);
    checkPaymentStatus();
  }

  function successHtml(order) {
    var isCod = String(order.payment).toLowerCase() === "cod";
    var eta = A.fmtDate(order.eta);
    view.innerHTML =
      '<div class="success card">' +
      '<div class="success__burst" aria-hidden="true">' + '<i></i><i></i><i></i><i></i><i></i><i></i>' + '</div>' +
      '<div class="success__check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" fill="none"/><path fill="none" d="M14 27l8 8 16-16"/></svg></div>' +
      '<h1>Order ' + (isCod ? "confirmed!" : "successful!") + '</h1>' +
      '<p class="success__sub">' + (isCod ? "Keep " + money(order.totals.total) + ' ready at your doorstep.' : "We received your payment of <b>" + money(order.totals.total) + "</b>.") + '</p>' +
      '<div class="success__meta card-inset">' +
      '<div><span>Order ID</span><b>' + order.id + '</b></div>' +
      '<div><span>Payment</span><b>' + esc(String(order.payment).toUpperCase()) + ' · ' + esc(order.paymentStatus) + '</b></div>' +
      '<div><span>Delivery by</span><b>' + eta + '</b></div>' +
      '<div><span>Deliver to</span><b>' + esc(order.address.name) + ', ' + esc(order.address.city) + '</b></div>' +
      '</div>' +
      '<div class="success__cta">' +
      '<a class="btn btn--primary" href="#/orders/' + order.id + '">Track order</a>' +
      '<a class="btn btn--ghost" href="#/">Continue shopping</a>' +
      '</div></div>' +
      shelf("Complete your desk", "Frequently bought together", D.PRODUCTS.filter(function (p) { return p.tags.indexOf("bestseller") > -1; }).slice(0, 6));
  }

  /* ================= ORDERS ================= */

  /* pull authoritative statuses for server-placed orders (fire & forget) */
  var orderSyncTimer = null;
  function syncServerOrders() {
    if (!orderSyncTimer) orderSyncTimer = setInterval(function () {
      var path = (location.hash || "#").split("?")[0];
      if (path === "#/orders" || path.indexOf("#/orders/") === 0) syncServerOrders();
    }, 15000);
    var pending = A.state.orders.filter(function (o) { return o._srv; });
    if (!pending.length) return;
    fetch("/api/orders", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) return null; return r.json(); })
      .then(function (data) {
        if (!data || !data.orders) return;
        var map = {};
        data.orders.forEach(function (o) { map[o.id] = o; });
        var stageMap = { PLACED: 0, PACKED: 1, SHIPPED: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4, CANCELLED: -1 };
        var changed = false;
        pending.forEach(function (o) {
          var s = map[o.id];
          if (!s) return;
          var confirmed = s.payment_status === "PAID";
          var shippingFinalized = Number(s.shipping_finalized) !== 0;
          var paymentLabel = confirmed ? "Paid ✓" : (!shippingFinalized ? "Delivery charge awaiting store quote" : (String(s.payment_method).toUpperCase() === "UPI" ? "Awaiting payment verification" : "Pay on delivery"));
          var shipping = Number(s.shipping) || 0;
          var total = Number(s.total_amount) || 0;
          if (o.paymentConfirmed !== confirmed || o.paymentStatus !== paymentLabel || o.shippingFinalized !== shippingFinalized || o.totals.shipping !== shipping || o.totals.total !== total) {
            o.paymentConfirmed = confirmed;
            o.paymentStatus = paymentLabel;
            o.shippingFinalized = shippingFinalized;
            o.totals.shipping = shipping;
            o.totals.total = total;
            changed = true;
          }
          if (s.status === "CANCELLED") {
            if (o.status !== "Cancelled") { o.status = "Cancelled"; changed = true; }
            return;
          }
          var si = stageMap[s.status];
          if (si == null) return;
          if (o.status !== A.STATUS_STAGES[si] || o.stageIndex !== si) {
            o.status = A.STATUS_STAGES[si];
            o.stageIndex = si;
            changed = true;
          }
        });
        if (changed) {
          A.save();
          var path = (location.hash || "#").split("?")[0];
          if (path === "#/orders" || path.indexOf("#/orders/") === 0) rerender();
        }
      })
      .catch(function () { /* offline — keep last known status */ });
  }

  function ordersPage() {
    syncServerOrders();
    var orders = A.state.orders;
    if (orders.length === 0) {
      view.innerHTML = emptyState("📦", "No orders yet", "When you place an order, it will show up here.",
        '<a class="btn btn--primary" href="#/">Start shopping</a>');
      return;
    }
    view.innerHTML =
      crumbs([{ label: "Home", href: "#/" }, { label: "My orders" }]) +
      '<div class="orderspage"><h1>My orders</h1>' +
      orders.map(function (o) {
        var thumbs = o.items.slice(0, 4).map(function (it) {
          var p = D.findProduct(it.id);
          var img = p ? p.img : "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><text x="40" y="52" font-size="36" text-anchor="middle">' + (it.emoji || "📦") + '</text></svg>');
          return '<span class="othumb"><img src="' + img + '" alt="" /></span>';
        }).join("") + (o.items.length > 4 ? '<span class="othumb othumb--more">+' + (o.items.length - 4) + '</span>' : "");
        return '<article class="ocard card">' +
          '<header><div><p class="ocard__id">Order ' + o.id + ' · ' + A.fmtDate(o.placedAt) + '</p>' +
          '<p class="ocard__total">' + (o.shippingFinalized ? money(o.totals.total) : "Delivery charge pending") + ' · ' + esc(String(o.payment).toUpperCase()) + '</p>' + (o.payment === "upi" && !o.paymentConfirmed ? '<small class="payment-pending">' + esc(o.paymentStatus || "Awaiting payment verification") + '</small>' : "") + '</div>' + statusPill(o.status) + '</header>' +
          '<div class="ocard__mid"><div class="othumbs">' + thumbs + '</div>' +
          (o.status === "Delivered" ? '<p class="ocard__eta ocard__eta--ok">Delivered ' + A.fmtDate(o.eta) + '</p>'
            : o.status === "Cancelled" ? '<p class="ocard__eta ocard__eta--no">Cancelled · refund in 3–5 days</p>'
            : '<p class="ocard__eta">Arriving by <b>' + A.fmtDate(o.eta) + '</b></p>') + '</div>' +
          '<footer>' +
          '<a class="btn btn--soft btn--sm" href="#/orders/' + o.id + '">View details</a>' +
          (o.status !== "Delivered" && o.status !== "Cancelled" ? '<button class="btn btn--ghost btn--sm" data-cancel="' + o.id + '">Cancel</button>' : "") +
          '<button class="btn btn--ghost btn--sm" data-reorder="' + o.id + '">↻ Reorder</button>' +
          '</footer></article>';
      }).join("") + '</div>';
  }

  function orderDetailPage(id) {
    syncServerOrders();
    var o = A.state.orders.filter(function (x) { return x.id === id; })[0];
    if (!o) { view.innerHTML = emptyState("🧾", "Order not found", "", '<a class="btn btn--primary" href="#/orders">My orders</a>'); return; }

    var cancelled = o.status === "Cancelled";
    var timeline = cancelled
      ? '<div class="tl tl--cancelled"><p>❌ This order was cancelled. Any payment will be refunded to source in 3–5 working days.</p></div>'
      : '<div class="tl">' + A.STATUS_STAGES.map(function (s, i) {
          var done = i <= o.stageIndex;
          var cur = i === o.stageIndex;
          return '<div class="tl__step' + (done ? " tl__step--done" : "") + (cur ? " tl__step--cur" : "") + '">' +
            '<span class="tl__dot"></span><span class="tl__label">' + s + '</span></div>';
        }).join("") + '</div>';

    var items = o.items.map(function (it) {
      var p = D.findProduct(it.id);
      var img = p ? p.img : "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><text x="40" y="52" font-size="36" text-anchor="middle">' + (it.emoji || "📦") + '</text></svg>');
      return '<div class="mini mini--lg"><img src="' + img + '" alt="" />' +
        '<span>' + (p ? '<a href="#/p/' + p.id + '">' + esc(it.name) + '</a>' : esc(it.name)) + '</span>' +
        '<em>×' + it.qty + '</em><b>' + money(it.price * it.qty) + '</b></div>';
    }).join("");

    view.innerHTML =
      crumbs([{ label: "Home", href: "#/" }, { label: "My orders", href: "#/orders" }, { label: o.id }]) +
      '<div class="odetail">' +
      '<header class="odetail__head"><div><h1>Order ' + o.id + '</h1><p>Placed ' + A.fmtDateTime(o.placedAt) + ' · ' + esc(String(o.payment).toUpperCase()) + ' · ' + esc(o.paymentStatus) + '</p></div>' +
      statusPill(o.status) + '</header>' +
      '<div class="odetail__grid">' +
      '<section class="card odetail__box"><h2>shipment timeline</h2>' + timeline +
      '<p class="ocard__eta odetail__eta">🚚 ' + (o.status === "Delivered" ? "Delivered on " + A.fmtDate(o.eta) : cancelled ? "Order cancelled" : "Arriving by <b>" + A.fmtDate(o.eta) + "</b>") + '</p></section>' +
      '<section class="card odetail__box"><h2>items (' + o.qty + ')</h2><div class="minis">' + items + '</div>' +
      '<div class="odetail__ops">' +
      (o.status !== "Delivered" && !cancelled ? '<button class="btn btn--ghost btn--sm" data-cancel="' + o.id + '">Cancel order</button>' : "") +
      '<button class="btn btn--soft btn--sm" data-reorder="' + o.id + '">↻ Reorder</button>' +
      '<button class="btn btn--ghost btn--sm" data-invoice="' + o.id + '">🧾 Invoice</button>' +
      '</div></section>' +
      '<section class="card odetail__box"><h2>delivery address</h2>' +
      '<p class="odetail__addr"><b>' + esc(o.address.name) + '</b> · ' + esc(o.address.phone) + '<br/>' +
      esc(o.address.line) + ', ' + esc(o.address.city) + ' — ' + esc(o.address.pin) + '</p></section>' +
      '<section class="card odetail__box"><h2>payment summary</h2>' +
      '<div class="prow"><span>Items total</span><b>' + money(o.totals.subtotal) + '</b></div>' +
      '<div class="prow"><span>Delivery</span><b>' + (o.shippingFinalized ? (o.totals.shipping === 0 ? '<span class="green">FREE</span>' : money(o.totals.shipping)) : "Awaiting store quote") + '</b></div>' +
      '<div class="prow prow--total"><span>Total ' + (String(o.payment).toLowerCase() === "cod" ? "(pay on delivery)" : o.paymentConfirmed ? "(paid)" : o.shippingFinalized ? "(payment awaiting verification)" : "(not final yet)") + '</span><b>' + (o.shippingFinalized ? money(o.totals.total) : "—") + '</b></div>' +
      (!cancelled && o.shippingFinalized && !o.paymentConfirmed ? '<a class="btn btn--primary btn--block" href="#/pay/' + encodeURIComponent(o.id) + '">Pay ' + money(o.totals.total) + ' by UPI</a>' : (!cancelled && !o.shippingFinalized ? '<p class="safe-note">The store will set the delivery charge after reviewing your address. You can pay here when the final amount is ready.</p>' : "")) +
      '</section></div>' +
      '<a class="linkbtn" href="#/orders">← All orders</a></div>';
  }

  /* ================= ACCOUNT ================= */

  function accountPage(query) {
    var tab = query.tab || "profile";
    var user = A.state.user ? A.findUser(A.state.user) : null;
    if (!user) { A.openAuth("login", "Login to view your account."); view.innerHTML = emptyState("👋", "You’re not logged in", "Sign in with your Gmail address to see your profile, orders & addresses.", '<button class="btn btn--primary" data-openauth="login">Sign in with email</button>'); return; }

    var tabs = [
      { id: "profile", icon: "👤", label: "Profile" },
      { id: "orders", icon: "📦", label: "Orders" },
      { id: "addresses", icon: "📍", label: "Addresses" },
      { id: "wishlist", icon: "♥", label: "Wishlist" }
    ];

    var pane = "";
    if (tab === "profile") {
      pane = '<div class="apane"><h2>Profile</h2>' +
        '<div class="profcard card-inset"><span class="profcard__avatar">' + esc(user.name.charAt(0).toUpperCase()) + '</span>' +
        '<div><b>' + esc(user.name) + '</b><span>' + esc(user.email || "") + '</span><em>UVID member since ' + A.fmtDate(user.joined) + '</em></div>' +
        '<button class="btn btn--soft btn--sm" data-editprofile>Edit profile</button></div>' +
        '<ul class="accstats"><li><b>' + A.state.orders.length + '</b><span>orders</span></li><li><b>' + A.state.wishlist.length + '</b><span>wishlist</span></li>' +
        '<li><b>' + A.state.addresses.length + '</b><span>addresses</span></li></ul>' +
        '<button class="btn btn--ghost" data-signout>Sign out</button></div>';
    } else if (tab === "orders") {
      var os = A.state.orders.slice(0, 4);
      pane = '<div class="apane"><h2>Recent orders</h2>' +
        (os.length ? os.map(function (o) {
          return '<div class="ocard card ocard--slim"><header><div><p class="ocard__id">' + o.id + ' · ' + A.fmtDate(o.placedAt) + '</p>' +
            '<p class="ocard__total">' + money(o.totals.total) + '</p></div>' + statusPill(o.status) + '</header>' +
            '<footer><a class="btn btn--soft btn--sm" href="#/orders/' + o.id + '">Details</a></footer></div>';
        }).join("") + '<a class="linkbtn" href="#/orders">View all orders →</a>'
          : '<p class="apane__empty">No orders yet. <a href="#/">Start shopping →</a></p>') + '</div>';
    } else if (tab === "addresses") {
      pane = '<div class="apane"><h2>Saved addresses</h2>' +
        (A.state.addresses.length ? A.state.addresses.map(function (a) {
          return '<div class="card-inset addrline"><div><b>' + esc(a.name) + '</b> · ' + esc(a.phone) +
            '<span>' + esc(a.line) + ', ' + esc(a.city) + ' — ' + esc(a.pin) + '</span></div>' +
            '<button class="linkbtn linkbtn--danger" data-deladdr="' + a.id + '">Delete</button></div>';
        }).join("") : '<p class="apane__empty">No saved addresses yet.</p>') +
        '<div class="addr-new card"><h3>➕ Add address</h3>' + addressFormHtml("acct") + '</div></div>';
    } else if (tab === "wishlist") {
      var wl = A.state.wishlist.map(D.findProduct).filter(Boolean);
      pane = '<div class="apane"><h2>Wishlist (' + wl.length + ')</h2>' +
        (wl.length ? '<div class="hgrid hgrid--account">' + wl.slice(0, 6).map(productCard).join("") + '</div><a class="linkbtn" href="#/wishlist">Open full wishlist →</a>'
          : '<p class="apane__empty">Nothing saved yet. <a href="#/">Browse products →</a></p>') + '</div>';
    }

    view.innerHTML =
      crumbs([{ label: "Home", href: "#/" }, { label: "My account" }]) +
      '<div class="accpage">' +
      '<nav class="accnav card">' + tabs.map(function (t) {
        return '<a class="accnav__item' + (tab === t.id ? " accnav__item--on" : "") + '" href="#/account?tab=' + t.id + '">' + t.icon + ' ' + t.label + '</a>';
      }).join("") + '</nav>' + pane + '</div>';

    var f = $("#acctForm");
    if (f) f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var res = readAddressForm("acct");
      var err = $("#acctErr");
      if (res.err) { err.textContent = res.err; err.hidden = false; return; }
      err.hidden = true;
      try {
        var savedAddress = await saveAddressToServer(res.addr);
        A.state.addresses.unshift(savedAddress);
        A.save();
        A.toast("Address saved to your account", true);
        rerender();
      } catch (error) {
        err.textContent = error.message || "Could not save your address. Please try again.";
        err.hidden = false;
      }
    });
    var editBtn = $$("[data-editprofile]")[0];
    if (editBtn) editBtn.addEventListener("click", function () { A.openAuth("profile"); });
  }

  /* ================= routing ================= */

  function rerender() {
    if (window.PT.App && window.PT.App.navigateTo) A.navigateTo(location.hash || "#/");
  }

  window.PT.View = {
    registerRoutes: function () {
      A.route("", function () { home(); });
      A.route("c/:slug", function (params, query) { listing(params, query); });
      A.route("search", function (params, query) { listing(params, query); });
      A.route("p/:id", function (params, query) { productPage(params.id, query); });
      A.route("cart", function () { cartPage(); });
      A.route("wishlist", function () { wishlistPage(); });
      A.route("checkout", function () { checkoutPage(); });
      A.route("pay/:orderId", function (params) { paymentPage(params.orderId); });
      A.route("orders", function () { ordersPage(); });
      A.route("orders/:id", function (params) { orderDetailPage(params.id); });
      A.route("account", function (params, query) { accountPage(query || {}); });
    },
    rerender: rerender
  };

  /* ================= global event delegation ================= */

  document.addEventListener("click", function (e) {
    var t = e.target;

    var add = t.closest("[data-add]");
    if (add) { e.preventDefault(); e.stopPropagation(); A.addToCart(add.getAttribute("data-add")); rerenderSoft(); return; }

    var buy = t.closest("[data-buy]");
    if (buy) { e.preventDefault(); e.stopPropagation(); if (A.addToCart(buy.getAttribute("data-buy"))) A.navigateTo("#/cart"); return; }

    var wish = t.closest("[data-wish]");
    if (wish) { e.preventDefault(); e.stopPropagation(); A.toggleWishlist(wish.getAttribute("data-wish")); rerenderSoft(); return; }

    var qty = t.closest("[data-qty]");
    if (qty) {
      e.preventDefault();
      var id = qty.getAttribute("data-id");
      var cur = 0;
      A.state.cart.forEach(function (l) { if (l.id === id) cur = l.qty; });
      if (qty.getAttribute("data-qty") === "inc") { if (cur === 0) A.addToCart(id); else A.setQty(id, cur + 1); }
      else A.setQty(id, cur - 1);
      rerenderSoft();
      return;
    }

    var rm = t.closest("[data-remove]");
    if (rm) { e.preventDefault(); A.setQty(rm.getAttribute("data-remove"), 0); A.toast("Removed from cart", true); rerenderSoft(); return; }

    var sv = t.closest("[data-savelater]");
    if (sv) {
      e.preventDefault();
      var pid = sv.getAttribute("data-savelater");
      var had = A.inWishlist(pid);
      A.setQty(pid, 0);
      if (!had) A.toggleWishlist(pid);
      A.toast("Moved to wishlist", true);
      rerenderSoft();
      return;
    }

    var rw = t.closest("[data-removefromwish]");
    if (rw) { e.preventDefault(); A.toggleWishlist(rw.getAttribute("data-removefromwish")); rerenderSoft(); return; }

    var cc = t.closest("[data-clearcart]");
    if (cc) { e.preventDefault(); A.state.cart.slice().forEach(function (l) { A.setQty(l.id, 0); }); A.toast("Cart cleared", true); rerenderSoft(); return; }

    var cf = t.closest("[data-clearfilters]");
    if (cf) { e.preventDefault(); A.navigateTo(currentBase()); return; }

    var fl = t.closest("[data-filter]");
    if (fl) {
      toggleFilter(fl.getAttribute("data-filter"), fl.getAttribute("data-val"), fl.checked, fl.hasAttribute("data-single"));
      return;
    }

    var cn = t.closest("[data-cancel]");
    if (cn) { e.preventDefault(); A.cancelOrder(cn.getAttribute("data-cancel")); return; }

    var ro = t.closest("[data-reorder]");
    if (ro) {
      e.preventDefault();
      var o = A.state.orders.filter(function (x) { return x.id === ro.getAttribute("data-reorder"); })[0];
      if (o && A.requireLogin("Login to reorder.")) {
        o.items.forEach(function (it) { A.addToCart(it.id, it.qty); });
        A.navigateTo("#/cart");
      }
      return;
    }

    var inv = t.closest("[data-invoice]");
    if (inv) { e.preventDefault(); A.toast("Invoice " + inv.getAttribute("data-invoice") + ".pdf downloaded (demo)", true); return; }

    var da = t.closest("[data-deladdr]");
    if (da) {
      e.preventDefault();
      var adid = da.getAttribute("data-deladdr");
      var removeLocalAddress = function () {
        A.state.addresses = A.state.addresses.filter(function (x) { return x.id !== adid; });
        if (A.session().addressId === adid) A.setSession({ addressId: null, address: null });
        A.save();
        A.toast("Address deleted", true);
        rerender();
      };
      if (/^adr-/.test(adid)) removeLocalAddress();
      else addressRequest("DELETE", "/api/addresses/" + encodeURIComponent(adid)).then(removeLocalAddress).catch(function (error) {
        A.toast(error.message || "Could not delete the saved address.", false);
      });
      return;
    }

    var oa = t.closest("[data-openauth]");
    if (oa) { e.preventDefault(); A.openAuth(oa.getAttribute("data-openauth") || "login"); return; }

    var so = t.closest("[data-signout]");
    if (so) { e.preventDefault(); A.signOut(); return; }

    /* filters drawer close on backdrop */
    if (t.id === "backdrop") { closeDrawer(); }

    /* close search drop when clicking outside */
    var drop = $("#searchDrop");
    if (drop && !t.closest(".search")) drop.classList.remove("search__drop--open");
  });

  function rerenderSoft() {
    var path = (location.hash || "#/").split("?")[0];
    if (path === "#/cart" || path === "#/checkout" || path === "#/wishlist") {
      var y = window.scrollY;
      rerender();
      window.scrollTo(0, y);
    } else {
      renderBadges();
    }
  }

  function renderBadges() {
    var n = A.cartCount(), w = A.state.wishlist.length;
    [["cartCount", n], ["cartCountM", n], ["wishCount", w], ["wishCountM", w]].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) { el.textContent = pair[1] > 99 ? "99+" : pair[1]; el.hidden = pair[1] === 0; }
    });
    /* active state in bottom nav */
    var path = (location.hash || "#/").split("?")[0];
    $$(".bnav").forEach(function (b) {
      var id = b.getAttribute("data-nav");
      var on = (id === "home" && path === "#/") ||
        (id === "browse" && (path === "#/search" || path.indexOf("#/c/") === 0)) ||
        (id === "wishlist" && path === "#/wishlist") ||
        (id === "orders" && path.indexOf("#/orders") === 0) ||
        (id === "cart" && path === "#/cart");
      b.classList.toggle("bnav--on", on);
    });
  }

  function closeDrawer() {
    var p = $("#filterPanel");
    if (p) p.classList.remove("filters--open");
    var b = $("#backdrop");
    if (b) b.classList.remove("backdrop--show");
    var d = $("#mobileDrawer");
    if (d) d.classList.remove("drawer--open");
    if (b) b.classList.remove("backdrop--show");
  }

  function renderHeaderCategories() {
    var html = (D.CATEGORIES || []).map(function (category) {
      var slug = esc(String(category.slug || ""));
      var label = esc(String(category.label || category.name || category.slug || "Category"));
      return '<a class="category-menu__item" role="menuitem" href="#/c/' + slug + '">' + label + '</a>';
    }).join("");
    ["headerCategoryLinks", "mobileCategoryLinks"].forEach(function (id) {
      var container = document.getElementById(id);
      if (container) container.innerHTML = html;
    });
  }

  function closeHeaderCategories() {
    var panel = $("#headerCategoryMenu");
    var toggle = $("#headerCategoryToggle");
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  /* bottom nav active state + cleanup on navigation */
  document.addEventListener("pt:route", renderBadges);
  window.addEventListener("hashchange", function () {
    closeDrawer();
    var drop = $("#searchDrop");
    if (drop) drop.classList.remove("search__drop--open");
    renderBadges();
  });

  /* ================= reveal on scroll ================= */

  function observeReveals() {
    var els = $$(".reveal:not(.reveal--in)");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("reveal--in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("reveal--in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ================= header chrome wiring ================= */

  document.addEventListener("DOMContentLoaded", function () {
    var categoryToggle = $("#headerCategoryToggle");
    var categoryPanel = $("#headerCategoryMenu");
    renderHeaderCategories();
    document.addEventListener("pt:catalog", renderHeaderCategories);
    if (categoryToggle && categoryPanel) {
      categoryToggle.addEventListener("click", function () {
        var open = categoryPanel.hidden;
        renderHeaderCategories();
        categoryPanel.hidden = !open;
        categoryToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      document.addEventListener("click", function (event) {
        if (!event.target.closest(".category-menu")) closeHeaderCategories();
      });
      categoryPanel.addEventListener("click", function (event) {
        if (event.target.closest("a")) closeHeaderCategories();
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeHeaderCategories();
      });
      window.addEventListener("hashchange", closeHeaderCategories);
    }

    /* mobile drawer */
    var burger = $("#burger");
    if (burger) burger.addEventListener("click", function () {
      var d = $("#mobileDrawer");
      var open = !d.classList.contains("drawer--open");
      d.classList.toggle("drawer--open", open);
      $("#backdrop").classList.toggle("backdrop--show", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    $$("#mobileDrawer a").forEach(function (a) {
      a.addEventListener("click", closeDrawer);
    });

    /* auth modal close + header chip */
    $$('[data-closeauth]').forEach(function (b) {
      b.addEventListener("click", A.closeAuth);
    });
    var chip = $("#accountChip");
    if (chip) chip.addEventListener("click", function () {
      if (A.state.user) A.navigateTo("#/account");
      else A.openAuth("login", "");
    });

    renderBadges();
  });

  /* refresh reveals after every render + on first paint */
  document.addEventListener("pt:route", function () { setTimeout(observeReveals, 30); });
  document.addEventListener("pt:route", function (event) {
    var path = String(event.detail || "");
    if (path.indexOf("checkout") !== -1) loadSavedAddresses("checkout");
    else if (path.indexOf("account") !== -1) loadSavedAddresses("account");
    else { addressLoadedKey = ""; addressPendingKey = ""; }
  });
  setTimeout(observeReveals, 120);

  /* ================= shipping simulation =================
     orders creep through the timeline while you browse */
  var shipTimers = {};
  function simulateShipping(order) {
    if (order._srv) return; /* server owns status transitions for real orders */
    if (order.status === "Delivered" || order.status === "Cancelled") return;
    if (shipTimers[order.id]) return;
    shipTimers[order.id] = setInterval(function () {
      var fresh = A.state.orders.filter(function (o) { return o.id === order.id; })[0];
      if (!fresh || fresh.status === "Cancelled" || fresh.stageIndex >= 3) {
        clearInterval(shipTimers[order.id]); delete shipTimers[order.id]; return;
      }
      fresh.stageIndex += 1;
      fresh.status = A.STATUS_STAGES[fresh.stageIndex];
      A.save();
      var path = (location.hash || "#").split("?")[0];
      if (path === "#/orders" || path === "#/orders/" + fresh.id || path === "#/account") rerender();
    }, 25000);
  }
  A.state.orders.forEach(simulateShipping);

  /* ================= search box behaviour ================= */

  document.addEventListener("DOMContentLoaded", function () {
    var input = $("#searchInput");
    var drop = $("#searchDrop");
    if (!input || !drop) return;

    function suggest() {
      var term = input.value.trim().toLowerCase();
      if (!term) { drop.classList.remove("search__drop--open"); drop.innerHTML = ""; return; }
      var hits = searchProducts(term).filter(function (p) { return p.tags.indexOf("vc-hidden") === -1; }).slice(0, 6);
      var cats = D.CATEGORIES.filter(function (c) { return c.label.toLowerCase().indexOf(term) !== -1; }).slice(0, 2);
      var html = "";
      cats.forEach(function (c) {
        html += '<a class="sd sd--cat" href="#/c/' + c.slug + '"><span>' + esc(c.label) + '</span></a>';
      });
      html += hits.map(function (p) {
        return '<a class="sd" href="#/p/' + p.id + '"><img src="' + p.img + '" alt="" /><span>' + esc(p.name) + '</span><b>' + money(p.price) + '</b></a>';
      }).join("");
      if (!html) html = '<p class="sd sd--none">No matches — try “pen”, “notebook”…</p>';
      else html += '<a class="sd sd--all" href="#/search?q=' + encodeURIComponent(input.value.trim()) + '">See all results for “' + esc(input.value.trim()) + '” →</a>';
      drop.innerHTML = html;
      drop.classList.add("search__drop--open");
    }

    input.addEventListener("input", suggest);
    input.addEventListener("focus", suggest);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var term = input.value.trim();
        drop.classList.remove("search__drop--open");
        if (term) { A.addSearch(term); A.navigateTo("#/search?q=" + encodeURIComponent(term)); }
      }
      if (e.key === "Escape") drop.classList.remove("search__drop--open");
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".search")) drop.classList.remove("search__drop--open");
    });
  });
})();
