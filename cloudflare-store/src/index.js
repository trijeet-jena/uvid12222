/* UVID Store API on Cloudflare Workers + D1.
 * Catalog data stays in D1; product image files are stored in Supabase Storage.
 */

import { buildPushPayload } from "@block65/webcrypto-web-push";

const GMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;
const IMAGE_LIMIT = 5_500_000; // stay below Supabase's recommended 6 MB standard-upload size
const D1_IMAGE_LIMIT = 1_400_000; // legacy fallback stays below D1's 2 MB row limit
const COOKIE = "uvid_session";
const encoder = new TextEncoder();

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
});
const error = (message, status = 400) => json({ error: message }, status);
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const clean = (v, max = 2000) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
const parseJson = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

function cookieValue(request, name) {
  return (request.headers.get("Cookie") || "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))?.slice(name.length + 1) || "";
}
function b64url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function unb64url(text) {
  const value = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(value + "=".repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function issueSession(env, user) {
  const payload = b64url(encoder.encode(JSON.stringify({ ...user, exp: Date.now() + 7 * 86400000 })));
  return payload + "." + b64url(await hmac(env.SESSION_SECRET, payload));
}
async function verifySession(env, token) {
  if (!token || !env.SESSION_SECRET || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = b64url(await hmac(env.SESSION_SECRET, parts[0]));
  if (expected.length !== parts[1].length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
  if (diff) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(unb64url(parts[0])));
    if (!data.exp || Date.now() >= data.exp || !["ADMIN", "CUSTOMER"].includes(data.role)) return null;
    return data;
  } catch { return null; }
}
function cookieHeader(token, maxAge = 604800) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function checkOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  let allowed = String(env.PUBLIC_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    if (allowed.includes(new URL(origin).origin)) return true;
    return new URL(origin).origin === new URL(request.url).origin;
  } catch { return false; }
}
async function bodyJson(request, max = 7_600_000) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > max) throw Object.assign(new Error("Request is too large."), { status: 413 });
  try { return await request.json(); } catch { throw Object.assign(new Error("Invalid JSON request."), { status: 400 }); }
}
function need(user, role) {
  if (!user) return error("Please sign in to continue.", 401);
  if (role && user.role !== role) return error("Admin access required.", 403);
  return null;
}
async function audit(env, request, user, action, target = null, detail = {}) {
  try {
    await env.DB.prepare("INSERT INTO audit_logs (actor_id,actor_name,role,action,target,detail,ip,user_agent) VALUES (?,?,?,?,?,?,?,?)")
      .bind(user?.id == null ? null : String(user.id), user?.name || null, user?.role || null, action, target,
        JSON.stringify(detail), request.headers.get("CF-Connecting-IP"), request.headers.get("User-Agent")?.slice(0, 250) || null).run();
  } catch { /* audit failures must not fail a product save */ }
}

function parseMeta(row) { return parseJson(row.meta_json, {}) || {}; }
function supabaseBucket(env) { return clean(env.SUPABASE_BUCKET || "product-image", 100) || "product-image"; }
function supabaseConfig(env) {
  const baseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const apiKey = String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl && !apiKey) return null;
  if (!baseUrl || !apiKey) throw Object.assign(new Error("Supabase Storage is only partly configured. Set both SUPABASE_URL and SUPABASE_SECRET_KEY in Worker secrets."), { status: 503 });
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw Object.assign(new Error("SUPABASE_URL is invalid."), { status: 503 }); }
  if (parsed.protocol !== "https:") throw Object.assign(new Error("SUPABASE_URL must use HTTPS."), { status: 503 });
  return { baseUrl, apiKey, bucket: supabaseBucket(env) };
}
function supabaseHeaders(config, extra = {}) {
  const headers = { apikey: config.apiKey, ...extra };
  // Legacy service_role keys are JWTs; current sb_secret keys belong only in apikey.
  if (/^eyJ/.test(config.apiKey)) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}
function encodeStoragePath(path) { return String(path).split("/").map(encodeURIComponent).join("/"); }
function supabaseObjectUrl(env, path) {
  const baseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseBucket(env))}/${encodeStoragePath(path)}`;
}
async function uploadSupabaseObject(env, path, bytes, mime) {
  const config = supabaseConfig(env);
  if (!config) throw Object.assign(new Error("Connect Supabase Storage first. Set SUPABASE_URL and SUPABASE_SECRET_KEY in Cloudflare Worker secrets."), { status: 503 });
  const response = await fetch(`${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: supabaseHeaders(config, { "Content-Type": mime, "cache-control": "31536000" }),
    body: bytes,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Supabase image upload failed (${response.status}). ${detail.slice(0, 180)}`), { status: 502 });
  }
  return supabaseObjectUrl(env, path);
}
async function deleteSupabaseObject(env, path) {
  const config = supabaseConfig(env);
  if (!config) throw Object.assign(new Error("Connect Supabase Storage first."), { status: 503 });
  const response = await fetch(`${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(path)}`, {
    method: "DELETE", headers: supabaseHeaders(config),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Supabase image deletion failed (${response.status}). ${detail.slice(0, 180)}`), { status: 502 });
  }
}
function versionedImageUrl(value) {
  const url = String(value || "");
  if (/^\/uploads\/[0-9a-f-]{36}(?:\?.*)?$/i.test(url)) return `${url.split("?")[0]}?v=2`;
  return value;
}
function imageView(row, env) {
  return { id: row.id, productId: row.product_id, variantKey: row.variant_key || null,
    url: row.storage_path ? supabaseObjectUrl(env, row.storage_path) : `/api/images/${row.id}?v=2`, mime: row.mime, byteSize: row.byte_size,
    width: row.width || null, height: row.height || null, altText: row.alt_text || null, sortOrder: row.sort_order };
}
function productView(row, images = [], env) {
  const meta = parseMeta(row);
  const variants = parseJson(row.variants_json, null);
  const variantStock = Array.isArray(variants) ? variants.reduce((n, v) => n + (Number(v.stock) || 0), 0) : null;
  return {
    id: row.id, productName: row.product_name, category: row.category, description: row.description,
    price: row.price, mrp: row.mrp, stockQuantity: row.stock_quantity,
    imageUrl: versionedImageUrl(row.image_url), images: images.map((image) => imageView(image, env)), emoji: row.emoji || null,
    variantLabel: row.variant_label || null, variants: Array.isArray(variants) ? variants : undefined,
    status: row.status, inStock: row.status !== "OUT_OF_STOCK" && (variantStock === null ? row.stock_quantity > 0 : variantStock > 0),
    createdAt: row.created_at, updatedAt: row.updated_at,
    brand: meta.brand || null, rating: meta.rating ?? null, ratingCount: meta.ratingCount || 0,
    tags: Array.isArray(meta.tags) ? meta.tags : [], specs: meta.specs || null,
    highlights: Array.isArray(meta.highlights) ? meta.highlights : null,
    bg: meta.bg || null, ink: meta.ink || null, parent: meta.parent || null,
  };
}
async function productRows(env, admin = false) {
  const sql = admin ? "SELECT * FROM products ORDER BY sort_order, product_name" : "SELECT * FROM products WHERE status IN ('ACTIVE','OUT_OF_STOCK') ORDER BY sort_order, product_name";
  const rows = (await env.DB.prepare(sql).all()).results || [];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  // D1 allows at most 100 bound parameters per query. Admin lists include
  // archived products too, so keep this lookup below that limit as the
  // catalog grows.
  const imageRows = [];
  for (let offset = 0; offset < ids.length; offset += 80) {
    const chunk = ids.slice(offset, offset + 80);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await env.DB.prepare(`SELECT i.*,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.product_id IN (${placeholders}) ORDER BY i.sort_order,i.id`).bind(...chunk).all();
    imageRows.push(...(result.results || []));
  }
  const byProduct = new Map();
  for (const im of imageRows) {
    const arr = byProduct.get(im.product_id) || [];
    arr.push(im); byProduct.set(im.product_id, arr);
  }
  return rows.map((r) => productView(r, byProduct.get(r.id) || [], env));
}
async function categories(env) {
  const rows = (await env.DB.prepare(
    `SELECT c.slug,c.name,c.emoji,c.blurb,c.image_url,c.sort_order,
       (SELECT COUNT(*) FROM products p WHERE p.category=c.slug AND p.status!='ARCHIVED') AS count
     FROM categories c ORDER BY c.sort_order,c.name`).all()).results || [];
  if (rows.length) return rows;
  return (await env.DB.prepare("SELECT category AS slug,category AS name,COUNT(*) AS count FROM products WHERE status!='ARCHIVED' GROUP BY category ORDER BY category").all()).results || [];
}
const slugify = (s) => clean(s, 120).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";

async function uniqueProductId(env, base) {
  const cleanBase = String(base || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";
  let id = cleanBase, n = 2;
  while (await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(id).first()) id = `${cleanBase}-${n++}`;
  return id;
}
function productInput(body, partial = false) {
  const values = {};
  if (!partial || body.productName !== undefined) {
    const v = clean(body.productName, 120); if (v.length < 2) throw Object.assign(new Error("Product name must be 2–120 characters."), { status: 400 }); values.product_name = v;
  }
  if (!partial || body.category !== undefined) {
    const v = clean(body.category, 40).toLowerCase(); if (!v) throw Object.assign(new Error("Category is required."), { status: 400 }); values.category = v;
  }
  if (!partial || body.description !== undefined) values.description = clean(body.description, 2000);
  if (!partial || body.price !== undefined) {
    const n = Number(body.price); if (!Number.isFinite(n) || n < 0 || n > 10000000) throw Object.assign(new Error("Enter a valid product price."), { status: 400 }); values.price = Math.round(n * 100) / 100;
  }
  if (body.mrp !== undefined) {
    const n = body.mrp === null || body.mrp === "" ? null : Number(body.mrp);
    if (n !== null && (!Number.isFinite(n) || n < 0)) throw Object.assign(new Error("Enter a valid MRP."), { status: 400 }); values.mrp = n === null ? null : Math.round(n * 100) / 100;
  }
  if (!partial || body.stockQuantity !== undefined) {
    const n = Number(body.stockQuantity ?? 0); if (!Number.isInteger(n) || n < 0 || n > 1000000) throw Object.assign(new Error("Stock must be a whole number 0 or higher."), { status: 400 }); values.stock_quantity = n;
  }
  if (!partial || body.imageUrl !== undefined) {
    const v = body.imageUrl == null ? null : clean(body.imageUrl, 2000);
    if (v && !/^(https?:\/\/|\/|data:image\/)/i.test(v)) throw Object.assign(new Error("Image must be a valid image URL."), { status: 400 }); values.image_url = v;
  }
  if (body.emoji !== undefined) values.emoji = clean(body.emoji, 8) || null;
  if (body.variantLabel !== undefined) values.variant_label = clean(body.variantLabel, 80) || null;
  if (body.variants !== undefined) {
    if (body.variants == null || body.variants === "") { values.variants_json = null; values.variant_label = null; }
    else if (!Array.isArray(body.variants) || body.variants.length > 12) throw Object.assign(new Error("Variants must be a list with at most 12 entries."), { status: 400 });
    else { values.variants_json = JSON.stringify(body.variants); if (body.variants[0]) values.variant_label = clean(body.variants[0].label || body.variants[0].size, 80); }
  }
  if (body.meta !== undefined) {
    if (body.meta === null) values.meta_json = null;
    else if (typeof body.meta !== "object" || Array.isArray(body.meta)) throw Object.assign(new Error("Invalid product metadata."), { status: 400 });
    else values.meta_json = JSON.stringify(body.meta);
  }
  if (body.status !== undefined) {
    const v = clean(body.status, 20).toUpperCase(); if (!["ACTIVE", "OUT_OF_STOCK", "ARCHIVED"].includes(v)) throw Object.assign(new Error("Invalid product status."), { status: 400 }); values.status = v;
  }
  return values;
}
async function getProduct(env, id) {
  const row = await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
  if (!row || row.status === "ARCHIVED") return null;
  const images = (await env.DB.prepare("SELECT i.*,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.product_id=? ORDER BY i.sort_order,i.id").bind(id).all()).results || [];
  return productView(row, images, env);
}
async function createProduct(env, body) {
  const values = productInput(body);
  if (values.mrp != null && values.mrp < values.price) throw Object.assign(new Error("MRP must be equal to or higher than price."), { status: 400 });
  const id = await uniqueProductId(env, body.sku ? clean(body.sku, 80) : slugify(values.product_name));
  values.status = values.status || (values.stock_quantity > 0 ? "ACTIVE" : "OUT_OF_STOCK");
  const cols = ["id", ...Object.keys(values), "sort_order"];
  const vals = [id, ...Object.values(values), Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 1000];
  await env.DB.prepare(`INSERT INTO products (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).bind(...vals).run();
  return getProduct(env, id);
}
async function updateProduct(env, id, body) {
  const old = await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
  if (!old) throw Object.assign(new Error("Product not found."), { status: 404 });
  const values = productInput(body, true);
  if (!Object.keys(values).length) throw Object.assign(new Error("Nothing to update."), { status: 400 });
  if (values.meta_json && old.meta_json) values.meta_json = JSON.stringify({ ...parseJson(old.meta_json, {}), ...JSON.parse(values.meta_json) });
  const price = values.price === undefined ? old.price : values.price;
  const mrp = values.mrp === undefined ? old.mrp : values.mrp;
  if (mrp != null && mrp < price) throw Object.assign(new Error("MRP must be equal to or higher than price."), { status: 400 });
  if (values.stock_quantity !== undefined && values.status === undefined && old.status !== "ARCHIVED") values.status = values.stock_quantity > 0 ? "ACTIVE" : "OUT_OF_STOCK";
  const sets = Object.keys(values).map((k) => `${k}=?`);
  await env.DB.prepare(`UPDATE products SET ${sets.join(",")},updated_at=? WHERE id=?`).bind(...Object.values(values), now(), id).run();
  return getProduct(env, id);
}

function mimeExtension(mime) { return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[mime] || null; }
function decodeImage(dataUri) {
  const match = /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUri || ""));
  if (!match) throw Object.assign(new Error("Send a JPEG, PNG, WebP or GIF image."), { status: 400 });
  const declared = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  let binary;
  try { binary = atob(match[2].replace(/\s/g, "")); } catch { throw Object.assign(new Error("The image data is invalid."), { status: 400 }); }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (!bytes.length) throw Object.assign(new Error("The image is empty."), { status: 400 });
  if (bytes.length > IMAGE_LIMIT) throw Object.assign(new Error("Image is too large. Choose a compressed photo under 5.5 MB."), { status: 413 });
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length > 8 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
  const webp = bytes.length > 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  const gif = String.fromCharCode(...bytes.slice(0,4)) === "GIF8";
  const detected = jpg ? "jpeg" : png ? "png" : webp ? "webp" : gif ? "gif" : null;
  if (!detected || detected !== declared) throw Object.assign(new Error("The image content does not match its file type."), { status: 400 });
  return { bytes, mime: `image/${detected}` };
}
function imageBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new Error("Stored image data has an unsupported format.");
}
async function hashBytes(bytes) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join(""); }
async function addProductImage(env, productId, body) {
  if (!(await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(productId).first())) throw Object.assign(new Error("Product not found."), { status: 404 });
  const variant = clean(body.variantKey || body.variant || "", 100) || null;
  const { bytes, mime } = decodeImage(body.image || body.dataUri);
  const storage = supabaseConfig(env);
  if (!storage && bytes.length > D1_IMAGE_LIMIT) throw Object.assign(new Error("Connect Supabase Storage to upload photos larger than 1.4 MB."), { status: 413 });
  const sha = await hashBytes(bytes);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM product_images WHERE product_id=?").bind(productId).first();
  if (Number(count?.n || 0) >= 24) throw Object.assign(new Error("This product already has 24 images."), { status: 409 });
  const dupe = await env.DB.prepare("SELECT i.*,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.product_id=? AND COALESCE(i.variant_key,'')=COALESCE(?,'') AND i.sha256=?").bind(productId, variant, sha).first();
  if (dupe) return imageView(dupe, env);
  const order = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM product_images WHERE product_id=?").bind(productId).first();
  const storagePath = storage ? `products/${crypto.randomUUID()}.${mimeExtension(mime)}` : null;
  const imageUrl = storage ? await uploadSupabaseObject(env, storagePath, bytes, mime) : null;
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO image_blobs (sha256,mime,byte_size,data) VALUES (?,?,?,?)")
      .bind(sha, mime, storage ? 0 : bytes.length, storage ? new Uint8Array(0) : bytes).run();
    const info = await env.DB.prepare("INSERT INTO product_images (product_id,variant_key,sha256,mime,byte_size,alt_text,sort_order) VALUES (?,?,?,?,?,?,?)")
      .bind(productId, variant, sha, mime, bytes.length, clean(body.altText, 160) || null, Number(order?.n || 0)).run();
    const imageId = info.meta?.last_row_id;
    if (storage) await env.DB.prepare("INSERT INTO product_image_objects (image_id,storage_path) VALUES (?,?)").bind(imageId, storagePath).run();
    if (Number(order?.n || 0) === 0) await env.DB.prepare("UPDATE products SET image_url=?,updated_at=? WHERE id=?").bind(imageUrl || `/api/images/${imageId}`, now(), productId).run();
    const saved = await env.DB.prepare("SELECT i.*,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.id=?").bind(imageId).first();
    return imageView(saved, env);
  } catch (cause) {
    if (storagePath) await deleteSupabaseObject(env, storagePath).catch(() => {});
    throw cause;
  }
}
async function productImages(env, id) { return (await env.DB.prepare("SELECT i.*,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.product_id=? ORDER BY i.sort_order,i.id").bind(id).all()).results || []; }
async function updatePrimary(env, id) {
  const first = await env.DB.prepare("SELECT i.id,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.product_id=? ORDER BY i.sort_order,i.id LIMIT 1").bind(id).first();
  const row = await env.DB.prepare("SELECT image_url FROM products WHERE id=?").bind(id).first();
  if (first) await env.DB.prepare("UPDATE products SET image_url=?,updated_at=? WHERE id=?").bind(first.storage_path ? supabaseObjectUrl(env, first.storage_path) : `/api/images/${first.id}`, now(), id).run();
  else {
    const managedBase = supabaseObjectUrl(env, "");
    if (row?.image_url?.startsWith("/api/images/") || (managedBase && row?.image_url?.startsWith(managedBase))) {
      await env.DB.prepare("UPDATE products SET image_url=NULL,updated_at=? WHERE id=?").bind(now(), id).run();
    }
  }
}
async function stats(env) {
  const q = async (sql) => Number((await env.DB.prepare(sql).first())?.n || 0);
  const products = await q("SELECT COUNT(*) n FROM products WHERE status!='ARCHIVED'");
  const outOfStock = await q("SELECT COUNT(*) n FROM products WHERE status!='ARCHIVED' AND (status='OUT_OF_STOCK' OR stock_quantity=0)");
  const recentProducts = (await env.DB.prepare("SELECT id,product_name,category,price,stock_quantity,status,image_url,updated_at FROM products WHERE status!='ARCHIVED' ORDER BY updated_at DESC,created_at DESC LIMIT 6").all()).results || [];
  const recentOrders = (await env.DB.prepare("SELECT o.id,o.total_amount,o.status,o.created_at,u.name AS customerName,u.mobile_number FROM orders o LEFT JOIN users u ON u.id=o.customer_id ORDER BY o.created_at DESC LIMIT 6").all()).results || [];
  return { products, inStock: products - outOfStock, outOfStock,
    lowStock: await q("SELECT COUNT(*) n FROM products WHERE stock_quantity>0 AND stock_quantity<=5 AND status!='ARCHIVED'"),
    inactive: await q("SELECT COUNT(*) n FROM products WHERE status='ARCHIVED'"),
    orders: await q("SELECT COUNT(*) n FROM orders"),
    openOrders: await q("SELECT COUNT(*) n FROM orders WHERE status IN ('AWAITING_PAYMENT','PLACED','PACKED','SHIPPED','OUT_FOR_DELIVERY')"),
    revenue: Number((await env.DB.prepare("SELECT COALESCE(SUM(total_amount),0) n FROM orders WHERE status!='CANCELLED' AND (payment_method!='UPI' OR payment_status='PAID')").first())?.n || 0),
    customers: await q("SELECT COUNT(*) n FROM users WHERE role='CUSTOMER'"), recentProducts, recentOrders };
}
async function orderList(env, customerId = null, status = null, includePaymentProof = false) {
  const proofColumn = includePaymentProof ? ",EXISTS (SELECT 1 FROM order_payment_proofs p WHERE p.order_id=o.id) AS payment_proof_available" : "";
  let sql = `SELECT o.*,COALESCE(q.finalized,1) AS shipping_finalized${proofColumn} FROM orders o LEFT JOIN order_delivery_quotes q ON q.order_id=o.id`, args = [];
  if (customerId != null) { sql += " WHERE customer_id=?"; args.push(customerId); }
  else if (status) { sql += " WHERE status=?"; args.push(status); }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const orders = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const rows = (await env.DB.prepare(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).bind(...ids).all()).results || [];
  const byOrder = new Map(); for (const row of rows) { const a = byOrder.get(row.order_id) || []; a.push(row); byOrder.set(row.order_id, a); }
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
}
function validPushEndpoint(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && (
      host === "fcm.googleapis.com" || host === "push.services.mozilla.com" || host.endsWith(".push.services.mozilla.com") ||
      host === "web.push.apple.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com")
    );
  } catch { return false; }
}
async function sendPaidOrderPush(env, order, customerName) {
  if (!env.VAPID_SERVER_PUBLIC_KEY || !env.VAPID_SERVER_PRIVATE_KEY) {
    return { sent: false, count: 0, reason: "not_configured" };
  }
  const subscriptions = (await env.DB.prepare("SELECT endpoint,p256dh,auth FROM admin_push_subscriptions").all()).results || [];
  if (!subscriptions.length) return { sent: false, count: 0, reason: "no_subscriptions" };
  const vapid = {
    subject: env.VAPID_SUBJECT || "https://uvidartandcraftsupplies.com",
    publicKey: env.VAPID_SERVER_PUBLIC_KEY,
    privateKey: env.VAPID_SERVER_PRIVATE_KEY,
  };
  const name = clean(customerName, 80) || "Customer";
  const amount = Number(order.total_amount).toFixed(2);
  const payloadData = {
    title: "New paid UVID order",
    body: `${name} placed order ${order.id}. Paid: ₹${amount}.`,
    url: "/admin/#/orders",
    tag: `uvid-order-${order.id}`,
  };
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    if (!validPushEndpoint(subscription.endpoint)) return false;
    try {
      const payload = await buildPushPayload({ data: payloadData, options: { ttl: 3600, urgency: "high" } }, {
        endpoint: subscription.endpoint,
        expirationTime: null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, vapid);
      const response = await fetch(subscription.endpoint, { ...payload, signal: AbortSignal.timeout(10000) });
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM admin_push_subscriptions WHERE endpoint=?").bind(subscription.endpoint).run();
      }
      return response.ok;
    } catch (cause) {
      console.warn("[ORDER PUSH] Could not deliver a paid-order notification.", cause?.name || "network error");
      return false;
    }
  }));
  const count = results.filter(Boolean).length;
  return { sent: count > 0, count, reason: count ? null : "delivery_failed" };
}
async function placeOrder(env, user, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 40) throw Object.assign(new Error("Add 1–40 items to the order."), { status: 400 });
  const address = body.address && typeof body.address === "object" ? body.address : {};
  if (!clean(address.line, 300) || !clean(address.city, 100) || !/^\d{6}$/.test(String(address.pin || ""))) throw Object.assign(new Error("Enter a delivery address, city and 6-digit PIN."), { status: 400 });
  const wants = new Map();
  for (const item of items) {
    const id = clean(item.productId || item.id, 120); const qty = Number(item.quantity ?? item.qty);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 99) throw Object.assign(new Error("One of the cart items is invalid."), { status: 400 });
    wants.set(id, (wants.get(id) || 0) + qty);
  }
  const products = (await env.DB.prepare(`SELECT * FROM products WHERE id IN (${[...wants.keys()].map(() => "?").join(",")})`).bind(...wants.keys()).all()).results || [];
  const byId = new Map(products.map((p) => [p.id,p]));
  let subtotal = 0; const lines = [];
  for (const [id, qty] of wants) {
    const p = byId.get(id); if (!p || p.status === "ARCHIVED") throw Object.assign(new Error("A cart item is no longer available."), { status: 409 });
    if (p.status === "OUT_OF_STOCK" || p.stock_quantity < qty) throw Object.assign(new Error(`${p.product_name} does not have enough stock.`), { status: 409 });
    subtotal += p.price * qty; lines.push({ p, qty });
  }
  const discount = 0;
  const shipping = 0;
  const method = String(body.paymentMethod || "UPI").toUpperCase();
  if (method !== "UPI") throw Object.assign(new Error("Only UPI QR payment is available."), { status: 400 });
  const batches = [
    env.DB.prepare("INSERT INTO order_id_counter (id,last_value) VALUES (1,1) ON CONFLICT(id) DO UPDATE SET last_value=last_value+1 RETURNING last_value"),
    env.DB.prepare("INSERT INTO orders (id,customer_id,total_amount,status,payment_method,payment_status,address_json,eta,coupon,discount,shipping) SELECT 'UVID'||printf('%03d',last_value),?,?, 'AWAITING_PAYMENT',?,?,?,?,?,?,? FROM order_id_counter WHERE id=1")
      .bind(user.id,Math.round((subtotal+shipping)*100)/100,method,"PENDING",JSON.stringify(address),new Date(Date.now()+3*86400000).toISOString().slice(0,10),null,discount,shipping),
    env.DB.prepare("INSERT INTO order_delivery_quotes (order_id,finalized) SELECT 'UVID'||printf('%03d',last_value),0 FROM order_id_counter WHERE id=1")
  ];
  for (const line of lines) {
    batches.push(env.DB.prepare("INSERT INTO order_items (order_id,product_id,product_name,quantity,price_at_purchase,image_url) SELECT 'UVID'||printf('%03d',last_value),?,?,?,?,? FROM order_id_counter WHERE id=1").bind(line.p.id,line.p.product_name,line.qty,line.p.price,line.p.image_url));
    batches.push(env.DB.prepare("UPDATE products SET stock_quantity=stock_quantity-?,status=CASE WHEN stock_quantity-?<=0 THEN 'OUT_OF_STOCK' ELSE status END,updated_at=? WHERE id=?").bind(line.qty,line.qty,now(),line.p.id));
  }
  const batchResults = await env.DB.batch(batches);
  const orderNumber = Number(batchResults[0]?.results?.[0]?.last_value);
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) throw new Error("Could not allocate an order number.");
  const id = "UVID" + String(orderNumber).padStart(3, "0");
  return { order: (await orderList(env,user.id)).find((o) => o.id === id), items: lines.map((l) => ({ productId:l.p.id,name:l.p.product_name,qty:l.qty,priceAtPurchase:l.p.price,imageUrl:l.p.image_url })) };
}

async function handleApi(request, env, user, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  let body;
  const readBody = async () => { if (body === undefined) body = await bodyJson(request); return body; };
  const adminOnly = need(user, "ADMIN");
  const customerOnly = need(user, "CUSTOMER");

  if (path === "/api/auth/me" && method === "GET") return user ? json({ user }) : error("Not logged in.", 401);
  if (path === "/api/auth/logout" && method === "POST") return json({ ok:true },200,{"Set-Cookie":cookieHeader("",0)});
  if (path === "/api/auth/email/login" && method === "POST") {
    const b = await readBody(); const email = clean(b.email, 200).toLowerCase();
    if (!GMAIL_RE.test(email)) return error("Enter a valid Gmail address, such as name@gmail.com.");
    let row = await env.DB.prepare("SELECT id,email,name,role FROM users WHERE email=? COLLATE NOCASE").bind(email).first();
    if (row && row.role !== "CUSTOMER") return error("This Gmail address is reserved for admin sign-in.",403);
    if (!row) {
      const name = email.split("@")[0].replace(/[._+%-]+/g," ").trim() || "Customer";
      const out = await env.DB.prepare("INSERT INTO users (name,email,role) VALUES (?,?,'CUSTOMER')").bind(name,email).run();
      row = { id: out.meta?.last_row_id, email, name, role:"CUSTOMER" };
    }
    const token = await issueSession(env,{id:row.id,email:row.email,name:row.name,role:row.role});
    return json({ok:true,user:{id:row.id,email:row.email,name:row.name,role:row.role}},200,{"Set-Cookie":cookieHeader(token)});
  }
  if (path === "/api/auth/admin/login" && method === "POST") {
    const b = await readBody(); const email = clean(b.email,200).toLowerCase(); const password = String(b.password || "");
    if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return error("Admin sign-in is not configured on the backend yet.",503);
    if (email !== String(env.ADMIN_EMAIL).toLowerCase() || password !== env.ADMIN_PASSWORD) return error("Invalid admin credentials.",401);
    const token = await issueSession(env,{id:"admin",email:env.ADMIN_EMAIL,name:"UVID Admin",role:"ADMIN"});
    return json({ok:true,user:{id:"admin",email:env.ADMIN_EMAIL,name:"UVID Admin",role:"ADMIN"}},200,{"Set-Cookie":cookieHeader(token)});
  }
  if (path === "/api/auth/admin/mfa/status" && method === "GET") return adminOnly || json({enabled:false});
  if (path.startsWith("/api/auth/admin/mfa/") && method === "POST") return adminOnly || error("Two-factor setup is not available on this free Worker backend.",501);

  if (path === "/api/products" && method === "GET") {
    let rows = await productRows(env); const category = url.searchParams.get("category"); const q = (url.searchParams.get("q") || "").toLowerCase();
    if (category) rows = rows.filter((p) => p.category === category);
    if (q) rows = rows.filter((p) => (p.productName + " " + p.description).toLowerCase().includes(q));
    if (url.searchParams.get("inStock") === "1") rows = rows.filter((p) => p.inStock);
    return json({products:rows});
  }
  if (path === "/api/products/categories" && method === "GET") return json({categories:await categories(env)});
  if (path === "/api/addresses" && method === "GET") {
    if (customerOnly) return customerOnly;
    const addresses = (await env.DB.prepare("SELECT id,name,phone,line,city,pin,created_at AS createdAt FROM customer_addresses WHERE customer_id=? ORDER BY created_at DESC,id DESC").bind(user.id).all()).results || [];
    return json({addresses});
  }
  if (path === "/api/addresses" && method === "POST") {
    if (customerOnly) return customerOnly;
    const b = await readBody();
    const address = {
      id: crypto.randomUUID(), name: clean(b.name,120), phone: String(b.phone || "").replace(/\D/g,""),
      line: clean(b.line,300), city: clean(b.city,100), pin: String(b.pin || "").replace(/\D/g,"")
    };
    if (address.name.length < 2) return error("Enter your full name.");
    if (!/^\d{10}$/.test(address.phone)) return error("Phone must be 10 digits.");
    if (address.line.length < 5) return error("Enter a complete street address.");
    if (!address.city) return error("Enter your city.");
    if (!/^\d{6}$/.test(address.pin)) return error("PIN must be 6 digits.");
    await env.DB.prepare("INSERT INTO customer_addresses (id,customer_id,name,phone,line,city,pin) VALUES (?,?,?,?,?,?,?)")
      .bind(address.id,user.id,address.name,address.phone,address.line,address.city,address.pin).run();
    return json({ok:true,address},201);
  }
  let addressMatch = path.match(/^\/api\/addresses\/([^/]+)$/);
  if (addressMatch && method === "DELETE") {
    if (customerOnly) return customerOnly;
    const id = decodeURIComponent(addressMatch[1]);
    const result = await env.DB.prepare("DELETE FROM customer_addresses WHERE id=? AND customer_id=?").bind(id,user.id).run();
    if (!Number(result.meta?.changes || 0)) return error("Saved address not found.",404);
    return json({ok:true,id});
  }
  if (path.startsWith("/api/products/") && method === "GET") {
    const p = await getProduct(env, decodeURIComponent(path.slice("/api/products/".length)));
    return p ? json({product:p}) : error("Product not found.",404);
  }
  if (path === "/api/events" && method === "GET") return new Response("event: hello\ndata: {}\n\n",{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache"}});

  if (path === "/api/admin/products" && method === "GET") return adminOnly || json({products:await productRows(env,true)});
  if (path === "/api/admin/products" && method === "POST") {
    if (adminOnly) return adminOnly; const p = await createProduct(env,await readBody()); await audit(env,request,user,"product.create",p.id,{name:p.productName}); return json({ok:true,product:p},201);
  }
  let match = path.match(/^\/api\/admin\/products\/([^/]+)(?:\/(stock|price))?$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly; const id = decodeURIComponent(match[1]); const b=await readBody();
    const update = match[2] === "stock" ? {stockQuantity:b.stockQuantity} : match[2] === "price" ? {price:b.price} : b;
    const p=await updateProduct(env,id,update); await audit(env,request,user,"product.update",id,{fields:Object.keys(update)}); return json({ok:true,product:p});
  }
  if (match && method === "DELETE" && !match[2]) {
    if (adminOnly) return adminOnly; const id=decodeURIComponent(match[1]);
    const sold=await env.DB.prepare("SELECT COUNT(*) AS n FROM order_items WHERE product_id=?").bind(id).first();
    const exists = await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(id).first();
    if (!exists) return error("Product not found.",404);
    if (Number(sold?.n||0)>0) await env.DB.prepare("UPDATE products SET status='ARCHIVED',updated_at=? WHERE id=?").bind(now(),id).run();
    else {
      const images = (await env.DB.prepare("SELECT i.sha256,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.product_id=?").bind(id).all()).results || [];
      for (const image of images) if (image.storage_path) await deleteSupabaseObject(env,image.storage_path);
      await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
      for (const image of images) await env.DB.prepare("DELETE FROM image_blobs WHERE sha256=? AND NOT EXISTS (SELECT 1 FROM product_images WHERE sha256=?)").bind(image.sha256,image.sha256).run();
    }
    await audit(env,request,user,"product.delete",id,{}); return json({ok:true,archived:Number(sold?.n||0)>0});
  }
  if (path === "/api/admin/categories" && method === "GET") return adminOnly || json({categories:await categories(env)});
  if (path === "/api/admin/categories" && method === "POST") {
    if (adminOnly) return adminOnly; const b=await readBody(); const name=clean(b.name,40); if(name.length<2) return error("Category name must be 2–40 characters.");
    const slug=clean(b.slug,40).toLowerCase()||slugify(name);
    try { await env.DB.prepare("INSERT INTO categories (slug,name,emoji,blurb,image_url,sort_order) VALUES (?,?,?,?,?,?)").bind(slug,name,clean(b.emoji,8)||null,clean(b.blurb,120)||null,clean(b.imageUrl,500)||null,Number(b.sortOrder)||100).run(); }
    catch { return error("A category with this name already exists.",409); }
    return json({ok:true,category:await env.DB.prepare("SELECT * FROM categories WHERE slug=?").bind(slug).first()},201);
  }
  match = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly; const slug=decodeURIComponent(match[1]), b=await readBody();
    const cols={name:"name",emoji:"emoji",blurb:"blurb",imageUrl:"image_url",sortOrder:"sort_order"}; const sets=[],args=[];
    for(const [input,col] of Object.entries(cols)) if(b[input]!==undefined){sets.push(`${col}=?`);args.push(input==="sortOrder"?Number(b[input]):clean(b[input],input==="name"?40:500)||null);}
    if(!sets.length) return error("Nothing to update."); args.push(now(),slug);
    await env.DB.prepare(`UPDATE categories SET ${sets.join(",")},updated_at=? WHERE slug=?`).bind(...args).run();
    return json({ok:true,category:await env.DB.prepare("SELECT * FROM categories WHERE slug=?").bind(slug).first()});
  }
  if (match && method === "DELETE") {
    if (adminOnly) return adminOnly; const slug=decodeURIComponent(match[1]), b=await readBody().catch(()=>({}));
    const used=await env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE category=? AND status!='ARCHIVED'").bind(slug).first();
    if(Number(used?.n||0)>0){ if(!b.reassignTo) return error("Move the category's products first.",409); await env.DB.prepare("UPDATE products SET category=?,updated_at=? WHERE category=?").bind(clean(b.reassignTo,40),now(),slug).run(); }
    await env.DB.prepare("DELETE FROM categories WHERE slug=?").bind(slug).run(); return json({ok:true,moved:Number(used?.n||0)});
  }
  if (path === "/api/admin/upload" && method === "POST") {
    if (adminOnly) return adminOnly;
    const b = await readBody(); const { bytes, mime } = decodeImage(b.image); const id = crypto.randomUUID();
    const storage = supabaseConfig(env);
    if (storage) {
      const storagePath = `uploads/${id}.${mimeExtension(mime)}`;
      const imageUrl = await uploadSupabaseObject(env, storagePath, bytes, mime);
      try {
        await env.DB.prepare("INSERT INTO uploaded_image_objects (id,storage_path,mime,byte_size) VALUES (?,?,?,?)")
          .bind(id, storagePath, mime, bytes.length).run();
      } catch (cause) {
        await deleteSupabaseObject(env, storagePath).catch(() => {});
        throw cause;
      }
      return json({ ok: true, url: imageUrl }, 201);
    }
    if (bytes.length > D1_IMAGE_LIMIT) throw Object.assign(new Error("Connect Supabase Storage to upload photos larger than 1.4 MB."), { status: 413 });
    await env.DB.prepare("INSERT INTO uploaded_images (id,mime,byte_size,data) VALUES (?,?,?,?)").bind(id,mime,bytes.length,bytes).run();
    return json({ok:true,url:`/uploads/${id}`},201);
  }
  if (path === "/api/admin/stats" && method === "GET") return adminOnly || json({stats:await stats(env)});
  if (path === "/api/admin/orders" && method === "GET") return adminOnly || json({orders:await orderList(env,null,url.searchParams.get("status"),true)});
  if (path === "/api/admin/push/status" && method === "GET") {
    if (adminOnly) return adminOnly;
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_push_subscriptions").first();
    return json({
      available: Boolean(env.VAPID_SERVER_PUBLIC_KEY && env.VAPID_SERVER_PRIVATE_KEY),
      publicKey: env.VAPID_SERVER_PUBLIC_KEY || null,
      subscriptionCount: Number(row?.n || 0),
    });
  }
  if (path === "/api/admin/push/subscriptions" && method === "POST") {
    if (adminOnly) return adminOnly;
    if (!env.VAPID_SERVER_PUBLIC_KEY || !env.VAPID_SERVER_PRIVATE_KEY) return error("Phone notifications are not configured on the server yet.",503);
    const b = await readBody();
    const subscription = b.subscription && typeof b.subscription === "object" ? b.subscription : b;
    const endpoint = String(subscription.endpoint || "").slice(0,2048);
    const p256dh = String(subscription.keys?.p256dh || "");
    const auth = String(subscription.keys?.auth || "");
    if (!validPushEndpoint(endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,100}$/.test(auth)) {
      return error("This browser returned an invalid phone notification subscription.");
    }
    await env.DB.prepare("INSERT INTO admin_push_subscriptions (endpoint,p256dh,auth,created_at,updated_at) VALUES (?,?,?,datetime('now'),datetime('now')) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at")
      .bind(endpoint,p256dh,auth).run();
    await audit(env,request,user,"notification.push_subscribed",null,{});
    return json({ok:true});
  }
  if (path === "/api/admin/push/subscriptions" && method === "DELETE") {
    if (adminOnly) return adminOnly;
    const b = await readBody();
    const endpoint = String(b.endpoint || "").slice(0,2048);
    if (!validPushEndpoint(endpoint)) return error("The phone notification subscription is invalid.");
    await env.DB.prepare("DELETE FROM admin_push_subscriptions WHERE endpoint=?").bind(endpoint).run();
    await audit(env,request,user,"notification.push_unsubscribed",null,{});
    return json({ok:true});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/payment-proof$/);
  if (match && method === "GET") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const proof = await env.DB.prepare("SELECT mime,data FROM order_payment_proofs WHERE order_id=?").bind(id).first();
    if (!proof) return error("Payment screenshot not found.",404);
    return new Response(imageBytes(proof.data), { headers: {
      "Content-Type": proof.mime,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    }});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/delivery$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const b = await readBody();
    if (b.shipping === null || b.shipping === undefined || String(b.shipping).trim() === "") return error("Enter a delivery charge, or enter 0 for free delivery.");
    const value = Number(b.shipping);
    if (!Number.isFinite(value) || value < 0 || value > 10000000) return error("Delivery charge must be between ₹0 and ₹10,000,000.");
    const shipping = Math.round(value * 100) / 100;
    const current = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!current) return error("Order not found.",404);
    if (current.status === "CANCELLED") return error("A cancelled order cannot be repriced.",409);
    if (current.payment_status === "PAID") return error("This order is already paid, so its delivery charge cannot be changed.",409);
    if (current.payment_status === "PROOF_SUBMITTED") return error("A payment screenshot has been submitted, so the final total can no longer be changed.",409);
    const amounts = await env.DB.prepare("SELECT COALESCE(SUM(price_at_purchase*quantity),0) AS subtotal FROM order_items WHERE order_id=?").bind(id).first();
    const total = Math.round((Number(amounts?.subtotal || 0) - Number(current.discount || 0) + shipping) * 100) / 100;
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET shipping=?,total_amount=?,updated_at=? WHERE id=?").bind(shipping,total,timestamp,id),
      env.DB.prepare("INSERT INTO order_delivery_quotes (order_id,finalized,updated_at) VALUES (?,1,?) ON CONFLICT(order_id) DO UPDATE SET finalized=1,updated_at=excluded.updated_at").bind(id,timestamp)
    ]);
    await audit(env,request,user,"order.delivery_quote_saved",id,{shipping,total});
    return json({ok:true,order:(await orderList(env,null)).find((item)=>item.id===id)});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/payment$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!order) return error("Order not found.",404);
    if (order.payment_method !== "UPI") return error("This order is not a UPI payment.",409);
    if (order.status === "CANCELLED") return error("A cancelled order cannot be marked paid.",409);
    const quote = await env.DB.prepare("SELECT finalized FROM order_delivery_quotes WHERE order_id=?").bind(id).first();
    if (quote && Number(quote.finalized) !== 1) return error("Set the delivery charge before confirming payment.",409);
    const alreadyPaid = order.payment_status === "PAID";
    if (!alreadyPaid && !(await env.DB.prepare("SELECT 1 AS found FROM order_payment_proofs WHERE order_id=?").bind(id).first())) return error("The customer has not uploaded a payment screenshot yet.",409);
    if (!alreadyPaid) await env.DB.prepare("UPDATE orders SET payment_status='PAID',updated_at=? WHERE id=?").bind(now(),id).run();
    await audit(env,request,user,"order.payment_confirmed",id,{method:order.payment_method,paymentStatus:"PAID"});
    const notification = alreadyPaid
      ? { sent: false, count: 0, reason: "already_paid" }
      : await sendPaidOrderPush(env, order, parseJson(order.address_json, {}).name || "Customer");
    return json({ok:true,notification,order:(await orderList(env,null)).find((item)=>item.id===id)});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/push$/);
  if (match && method === "POST") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!order) return error("Order not found.",404);
    if (order.payment_status !== "PAID") return error("Confirm the payment before sending a paid-order notification.",409);
    const notification = await sendPaidOrderPush(env, order, parseJson(order.address_json, {}).name || "Customer");
    if (!notification.sent) {
      const message = notification.reason === "not_configured"
        ? "Phone notifications are not configured on the server yet."
        : notification.reason === "no_subscriptions"
          ? "No phone is subscribed yet. Enable order notifications in Admin → Settings on your phone."
          : "The phone notification could not be delivered. Check that the phone is online, then retry.";
      return error(message, notification.reason === "not_configured" ? 503 : notification.reason === "no_subscriptions" ? 409 : 502);
    }
    await audit(env,request,user,"order.push_sent",id,{devices:notification.count});
    return json({ok:true,notification});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if(match && method === "PUT"){
    if(adminOnly) return adminOnly; const b=await readBody(),status=clean(b.status,30).toUpperCase();
    if(!["AWAITING_PAYMENT","PLACED","PACKED","SHIPPED","OUT_FOR_DELIVERY","DELIVERED","CANCELLED"].includes(status)) return error("Invalid order status.");
    const orderId = decodeURIComponent(match[1]);
    const current = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(orderId).first();
    if (!current) return error("Order not found.",404);
    if (current.payment_method === "UPI" && current.payment_status !== "PAID" && status !== "CANCELLED") {
      if (current.status === "AWAITING_PAYMENT") return error("This order is not placed until the customer submits a payment screenshot.",409);
      if (status !== "PLACED") return error("Confirm the UPI payment before packing or shipping this order.",409);
    }
    if (status === "CANCELLED" && current.status !== "CANCELLED") {
      const items = (await env.DB.prepare("SELECT product_id,quantity FROM order_items WHERE order_id=?").bind(orderId).all()).results || [];
      const batches = [env.DB.prepare("UPDATE orders SET status='CANCELLED',updated_at=? WHERE id=?").bind(now(),orderId)];
      for (const item of items) batches.push(env.DB.prepare("UPDATE products SET stock_quantity=stock_quantity+?,status=CASE WHEN status='OUT_OF_STOCK' AND stock_quantity+?>0 THEN 'ACTIVE' ELSE status END,updated_at=? WHERE id=?").bind(item.quantity,item.quantity,now(),item.product_id));
      await env.DB.batch(batches);
      return json({ok:true});
    }
    await env.DB.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?").bind(status,now(),orderId); return json({ok:true});
  }
  if(path==="/api/admin/customers" && method==="GET") return adminOnly || json({customers:(await env.DB.prepare("SELECT id,name,email,mobile_number,created_at FROM users WHERE role='CUSTOMER' ORDER BY created_at DESC LIMIT 500").all()).results||[]});
  if(path==="/api/admin/audit" && method==="GET") return adminOnly || json({entries:(await env.DB.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?").bind(Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||25))).all()).results||[]});
  if(path==="/api/admin/seminar" && method==="GET") return adminOnly || json({seminar:await env.DB.prepare("SELECT * FROM seminar_details WHERE id=1").first(),registrations:(await env.DB.prepare("SELECT * FROM seminar_registrations ORDER BY created_at DESC LIMIT 500").all()).results||[]});
  if(path==="/api/admin/seminar/details" && method==="POST"){
    if(adminOnly) return adminOnly; const b=await readBody();
    await env.DB.prepare("UPDATE seminar_details SET title=?,description=?,event_date=?,event_time=?,location=?,meeting_url=?,speaker=?,agenda=?,contact_email=?,updated_at=? WHERE id=1")
      .bind(clean(b.title,200),clean(b.description,2000),clean(b.date,100),clean(b.time,100),clean(b.location,300),clean(b.meetingUrl,500),clean(b.speaker,200),Array.isArray(b.agenda)?b.agenda.map(x=>clean(x,200)).join("\n"):clean(b.agenda,2000),clean(b.contactEmail,200),now()).run();
    return json({ok:true});
  }

  if(path==="/api/orders" && method==="POST"){
    if(customerOnly) return customerOnly; const out=await placeOrder(env,user,await readBody()); return json({ok:true,...out},201);
  }
  if(path==="/api/orders" && method==="GET") return customerOnly || json({orders:await orderList(env,user.id)});
  match = path.match(/^\/api\/orders\/([^/]+)\/payment-proof$/);
  if (match && method === "POST") {
    if (customerOnly) return customerOnly;
    const id = decodeURIComponent(match[1]);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").bind(id,user.id).first();
    if (!order) return error("Order not found.",404);
    if (order.payment_method !== "UPI") return error("This order does not use UPI payment.",409);
    if (order.status === "CANCELLED") return error("A cancelled order cannot receive a payment screenshot.",409);
    if (order.payment_status === "PAID") return error("This order is already marked paid.",409);
    const quote = await env.DB.prepare("SELECT finalized FROM order_delivery_quotes WHERE order_id=?").bind(id).first();
    if (!quote || Number(quote.finalized) !== 1) return error("Wait until the store confirms your final delivery charge before uploading proof.",409);
    const b = await readBody();
    const { bytes, mime } = decodeImage(b.image || b.dataUri);
    if (!new Set(["image/jpeg","image/png","image/webp"]).has(mime)) return error("Upload a JPEG, PNG or WebP payment screenshot.");
    if (bytes.length > D1_IMAGE_LIMIT) return error("Payment screenshot must be 1.4 MB or smaller. Choose a compressed image.",413);
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO order_payment_proofs (order_id,mime,byte_size,data,created_at) VALUES (?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET mime=excluded.mime,byte_size=excluded.byte_size,data=excluded.data,created_at=excluded.created_at")
        .bind(id,mime,bytes.length,bytes,timestamp),
      env.DB.prepare("UPDATE orders SET status='PLACED',payment_status='PROOF_SUBMITTED',updated_at=? WHERE id=?").bind(timestamp,id),
    ]);
    await audit(env,request,user,"order.payment_proof_submitted",id,{mime,byteSize:bytes.length});
    return json({ok:true,order:(await orderList(env,user.id)).find((item)=>item.id===id)});
  }
  match=path.match(/^\/api\/orders\/([^/]+)(?:\/cancel)?$/);
  if(match && method==="POST" && path.endsWith("/cancel")){
    if(customerOnly) return customerOnly; const id=decodeURIComponent(match[1]);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").bind(id,user.id).first();
    if(!order) return error("Order not found.",404); if(!["AWAITING_PAYMENT","PLACED"].includes(order.status) || order.payment_status === "PAID") return error("This order can no longer be cancelled.",409);
    const items=(await env.DB.prepare("SELECT * FROM order_items WHERE order_id=?").bind(id).all()).results||[];
    const batch=[env.DB.prepare("UPDATE orders SET status='CANCELLED',updated_at=? WHERE id=?").bind(now(),id),...items.map(i=>env.DB.prepare("UPDATE products SET stock_quantity=stock_quantity+?,status='ACTIVE',updated_at=? WHERE id=?").bind(i.quantity,now(),i.product_id))];
    await env.DB.batch(batch); return json({ok:true,order:(await orderList(env,user.id)).find(o=>o.id===id)});
  }
  if(match && method==="GET"){
    if(customerOnly) return customerOnly; const id=decodeURIComponent(match[1]); const order=(await orderList(env,user.id)).find(o=>o.id===id); return order?json({order}):error("Order not found.",404);
  }

  match=path.match(/^\/api\/admin\/products\/([^/]+)\/images(?:\/order)?$/);
  if(match && path.endsWith("/images") && method==="GET"){
    if(adminOnly) return adminOnly; const rows=await productImages(env,decodeURIComponent(match[1]));
    const n=await env.DB.prepare("SELECT COUNT(*) AS imageCount,COALESCE(SUM(byte_size),0) AS storedBytes FROM product_images").first();
    return json({images:rows.map((image)=>imageView(image,env)),stats:{imageCount:n.imageCount,storedBytes:n.storedBytes}});
  }
  if(match && path.endsWith("/images") && method==="POST"){
    if(adminOnly) return adminOnly; const id=decodeURIComponent(match[1]), img=await addProductImage(env,id,await readBody()); await audit(env,request,user,"product.image.add",id,{imageId:img.id,byteSize:img.byteSize});
    return json({ok:true,image:img,images:(await productImages(env,id)).map((image)=>imageView(image,env))},201);
  }
  if(match && path.endsWith("/images/order") && method==="PUT"){
    if(adminOnly) return adminOnly; const id=decodeURIComponent(match[1]), b=await readBody(), current=await productImages(env,id);
    if(!Array.isArray(b.order)||b.order.length!==current.length||new Set(b.order).size!==current.length||b.order.some((n)=>!current.some((i)=>i.id===n))) return error("Invalid image order.");
    await env.DB.batch(b.order.map((imageId,index)=>env.DB.prepare("UPDATE product_images SET sort_order=? WHERE id=? AND product_id=?").bind(index,imageId,id)));
    await updatePrimary(env,id); return json({ok:true,images:(await productImages(env,id)).map((image)=>imageView(image,env))});
  }
  match=path.match(/^\/api\/admin\/images\/([^/]+)$/);
  if(match && method==="DELETE"){
    if(adminOnly) return adminOnly;
    const id=Number(match[1]);
    const img=await env.DB.prepare("SELECT i.product_id,i.sha256,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.id=?").bind(id).first();
    if(!img) return error("Image not found.",404);
    if(img.storage_path) await deleteSupabaseObject(env,img.storage_path);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM product_image_objects WHERE image_id=?").bind(id),
      env.DB.prepare("DELETE FROM product_images WHERE id=?").bind(id),
      env.DB.prepare("DELETE FROM image_blobs WHERE sha256=? AND NOT EXISTS (SELECT 1 FROM product_images WHERE sha256=?)").bind(img.sha256,img.sha256),
    ]);
    await updatePrimary(env,img.product_id); await audit(env,request,user,"product.image.delete",img.product_id,{imageId:id});
    return json({ok:true,id});
  }
  return error("Not found.",404);
}

async function serveImage(request, env, path) {
  const imageMatch = path.match(/^\/api\/images\/(\d+)$/);
  if (imageMatch && request.method === "GET") {
    const external = await env.DB.prepare("SELECT o.storage_path FROM product_image_objects o WHERE o.image_id=?").bind(Number(imageMatch[1])).first();
    if (external?.storage_path) {
      const url = supabaseObjectUrl(env, external.storage_path);
      return url ? Response.redirect(url, 302) : error("Image storage is not configured.",503);
    }
    const row = await env.DB.prepare("SELECT b.mime,b.data FROM product_images i JOIN image_blobs b ON b.sha256=i.sha256 WHERE i.id=?").bind(Number(imageMatch[1])).first();
    if (!row) return error("Image not found.",404);
    return new Response(imageBytes(row.data),{headers:{"Content-Type":row.mime,"Cache-Control":"public,max-age=300","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}});
  }
  const upload = path.match(/^\/uploads\/([0-9a-f-]{36})$/i);
  if (upload && request.method === "GET") {
    const external = await env.DB.prepare("SELECT storage_path FROM uploaded_image_objects WHERE id=?").bind(upload[1]).first();
    if (external?.storage_path) {
      const url = supabaseObjectUrl(env, external.storage_path);
      return url ? Response.redirect(url, 302) : error("Image storage is not configured.",503);
    }
    const row = await env.DB.prepare("SELECT mime,data FROM uploaded_images WHERE id=?").bind(upload[1]).first();
    if (!row) return error("Image not found.",404);
    return new Response(imageBytes(row.data),{headers:{"Content-Type":row.mime,"Cache-Control":"public,max-age=300","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}});
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url); const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (!env.DB) return error("The D1 database is not connected to this Worker yet.",503);
      if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{"Allow":"GET,POST,PUT,DELETE,OPTIONS"}});
      if (!checkOrigin(request,env) && !["GET","HEAD"].includes(request.method)) return error("Request origin is not allowed.",403);
      if (path.startsWith("/api/images/") || path.startsWith("/uploads/")) {
        const response=await serveImage(request,env,path); if(response) return response;
      }
      const token=cookieValue(request,COOKIE); const user=await verifySession(env,token);
      if (path.startsWith("/api/")) {
        if (!env.SESSION_SECRET) return error("Set the SESSION_SECRET Worker secret before using the store API.",503);
        return await handleApi(request,env,user,url);
      }
      return json({service:"UVID Store API",status:"ready"});
    } catch (e) {
      if (!e?.status) console.error("[UVID Worker]", e?.stack || e);
      return error(e?.status ? e.message : "Something went wrong on the store server.",e?.status || 500);
    }
  }
};
