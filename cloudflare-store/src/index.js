/* UVID Store API on Cloudflare Workers + D1.
 * Admin catalog data stays in D1; source-managed catalog items ship with this Worker.
 * Uploaded product image files are stored in Supabase Storage.
 */

import { buildPushPayload } from "@block65/webcrypto-web-push";
import "./code-products.js";

const CODE_PRODUCTS = globalThis.UVID_CODE_PRODUCTS || [];
const CODE_PRODUCT_BY_ID = new Map(CODE_PRODUCTS.map((product) => [product.id, product]));
const GMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;
const IMAGE_LIMIT = 5_500_000; // stay below Supabase's recommended 6 MB standard-upload size
const D1_IMAGE_LIMIT = 1_400_000; // legacy fallback stays below D1's 2 MB row limit
const CUSTOM_A4_PRODUCT_ID = "custom-a4-text-sheet";
const CUSTOM_A4_FONTS = new Set(["Arial", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Courier New"]);
const LEGACY_COOKIE = "uvid_session";
const CUSTOMER_COOKIE = "uvid_customer_session";
const ADMIN_COOKIE = "uvid_admin_session";
const encoder = new TextEncoder();

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
});
const error = (message, status = 400) => json({ error: message }, status);
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const clean = (v, max = 2000) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
const parseJson = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const paymentVerified = (order) => order?.payment_status === "PAID" || order?.payment_status === "VERIFIED";
function decodeCustomA4Design(value, productId) {
  if (productId !== CUSTOM_A4_PRODUCT_ID) {
    if (value != null) throw Object.assign(new Error("Custom artwork is only supported for the A4 design sheet."), { status: 400 });
    return null;
  }
  if (!value || Number(value.version) !== 1 || Number(value.width) !== 794 || Number(value.height) !== 1123 || !Array.isArray(value.objects) || !value.objects.length || value.objects.length > 40) {
    throw Object.assign(new Error("Add text to your A4 sheet before saving it."), { status: 400 });
  }
  const objects = value.objects.map((item) => {
    const text = String(item?.text == null ? "" : item.text).replace(/\r/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
    const x = Number(item?.x), y = Number(item?.y), fontSize = Number(item?.fontSize);
    const color = String(item?.color || "").toLowerCase();
    const align = String(item?.align || "left");
    const fontFamily = String(item?.fontFamily || "");
    if (!text.trim() || text.length > 3000 || !Number.isFinite(x) || x < 0 || x > 794 || !Number.isFinite(y) || y < 0 || y > 1123 || !Number.isFinite(fontSize) || fontSize < 8 || fontSize > 96 || !/^#[0-9a-f]{6}$/.test(color) || !["left", "center", "right"].includes(align) || !CUSTOM_A4_FONTS.has(fontFamily)) {
      throw Object.assign(new Error("One of the A4 text elements is invalid. Please review your design."), { status: 400 });
    }
    return {
      id: clean(item.id, 80), text, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
      fontFamily, fontSize: Math.round(fontSize * 100) / 100, color, align,
      bold: Boolean(item.bold), italic: Boolean(item.italic), underline: Boolean(item.underline),
    };
  });
  const imageBase64 = String(value.imageBase64 || "");
  if (!imageBase64 || imageBase64.length > Math.ceil(D1_IMAGE_LIMIT / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(imageBase64) || imageBase64.length % 4 === 1) {
    throw Object.assign(new Error("The A4 preview could not be saved. Please save the design again."), { status: 400 });
  }
  let binary;
  try { binary = atob(imageBase64); } catch { throw Object.assign(new Error("The A4 preview file is invalid."), { status: 400 }); }
  const image = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (!image.length || image.length > D1_IMAGE_LIMIT) throw Object.assign(new Error("The A4 preview must be 1.4 MB or smaller."), { status: 413 });
  if (image.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => image[index] === byte)) {
    throw Object.assign(new Error("The A4 preview must be a PNG image."), { status: 400 });
  }
  return { json: JSON.stringify({ version: 1, width: 794, height: 1123, background: "#ffffff", objects }), image };
}
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
    if (data.role === "ADMIN" && data.authMethod !== "password") return null;
    return data;
  } catch { return null; }
}
function cookieHeader(token, maxAge = 604800, name = LEGACY_COOKIE) {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function logoutResponse(...cookieNames) {
  const response = json({ ok: true });
  for (const name of cookieNames) response.headers.append("Set-Cookie", cookieHeader("", 0, name));
  return response;
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
  if (role && user.role !== role) return error(role === "ADMIN" ? "Admin access required." : "Customer sign-in required.", 403);
  return null;
}
async function audit(env, request, user, action, target = null, detail = {}) {
  try {
    await env.DB.prepare("INSERT INTO audit_logs (actor_id,actor_name,role,action,target,detail,ip,user_agent) VALUES (?,?,?,?,?,?,?,?)")
      .bind(user?.id == null ? null : String(user.id), user?.name || null, user?.role || null, action, target,
        JSON.stringify(detail), request.headers.get("CF-Connecting-IP"), request.headers.get("User-Agent")?.slice(0, 250) || null).run();
  } catch { /* audit failures must not fail a product save */ }
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

async function sendTransactionalEmail(env, message) {
  const smtp2goKey = clean(env.SMTP2GO_API_KEY, 1000);
  const brevoKey = clean(env.BREVO_API_KEY, 1000);
  const resendKey = clean(env.RESEND_API_KEY, 1000);
  const provider = smtp2goKey ? "smtp2go" : (brevoKey ? "brevo" : (resendKey ? "resend" : ""));
  const apiKey = provider === "smtp2go" ? smtp2goKey : (provider === "brevo" ? brevoKey : resendKey);
  if (!apiKey || !env.EMAIL_FROM) return { sent: false, reason: "not_configured" };

  const fromValue = clean(env.EMAIL_FROM, 300);
  const fromMatch = fromValue.match(/^(.+?)\s*<\s*([^<>]+)\s*>$/);
  const senderEmail = clean(fromMatch ? fromMatch[2] : fromValue, 254);
  const senderName = clean(fromMatch ? fromMatch[1] : "UVID Art and Craft Supplies", 100);
  const requestUrl = provider === "smtp2go"
    ? "https://api.smtp2go.com/v3/email/send"
    : (provider === "brevo" ? "https://api.brevo.com/v3/smtp/email" : "https://api.resend.com/emails");
  const requestHeaders = provider === "smtp2go"
    ? { "X-Smtp2go-Api-Key": apiKey, "Content-Type": "application/json", "Accept": "application/json" }
    : (provider === "brevo"
      ? { "api-key": apiKey, "Content-Type": "application/json", "Accept": "application/json" }
      : { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" });
  const requestBody = provider === "smtp2go"
    ? {
        sender: `${senderName} <${senderEmail}>`,
        to: [message.to],
        subject: message.subject,
        text_body: message.text,
        html_body: message.html,
      }
    : (provider === "brevo"
      ? {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: message.to }],
        subject: message.subject,
        ...(message.html ? { htmlContent: message.html } : { textContent: message.text }),
      }
      : {
          from: env.EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
  try {
    const response = await fetch(requestUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({}));
    const smtp2goResult = result?.data || {};
    const smtp2goFailed = provider === "smtp2go" && (Number(smtp2goResult.failed || 0) > 0 || ("succeeded" in smtp2goResult && Number(smtp2goResult.succeeded) < 1));
    if (!response.ok || smtp2goFailed) {
      const providerError = provider === "smtp2go"
        ? clean(JSON.stringify(smtp2goResult.failures?.[0] || result.error || "No rejection details returned."), 300)
        : clean(result.name || result.code || result.message || "No rejection details returned.", 300);
      console.warn("[EMAIL] Provider rejected a message.", provider, response.status, clean(result.name || result.code || "unknown_error", 100), providerError);
      return { sent: false, reason: "provider_error", provider };
    }
    return { sent: true, id: smtp2goResult.email_id || result.messageId || result.id || null, provider };
  } catch (cause) {
    console.warn("[EMAIL] Could not deliver a message.", provider, cause?.name || "network error");
    return { sent: false, reason: "delivery_failed", provider };
  }
}

function orderItemCodes(metaJson, variantLabel, productId) {
  const specs = parseJson(metaJson, {})?.specs || {};
  const labelCode = clean(variantLabel, 120).split(/\s*[·|—]\s*/)[0];
  const inferredCode = /^[A-Z][A-Z0-9_-]{2,}$/.test(labelCode) ? labelCode : "";
  return {
    productCode: clean(specs["Item Code"] || specs["Product Code"] || specs.Code || inferredCode || productId, 120),
    catalogueSku: clean(specs["Catalogue SKU"] || specs.SKU || "", 120),
  };
}

async function sendOrderEmail(env, order, type, items = []) {
  const email = clean(env.ADMIN_EMAIL, 200).toLowerCase();
  if (!email) return { sent: false, reason: "not_configured" };
  const isPaid = type === "paid";
  const isSubmitted = type === "submitted";
  const isLegacyPlaced = type === "placed";
  const address = parseJson(order.address_json, {}) || {};
  const itemSubtotal = items.reduce((sum, item) => sum + (Number(item.priceAtPurchase) || 0) * (Number(item.qty) || 0), 0);
  const amount = Number(order.total_amount || 0);
  const discount = Number(order.discount || 0);
  const shipping = Number(order.shipping || 0);
  const shippingPending = (isSubmitted || isLegacyPlaced) && Number(order.shipping_finalized) === 0;
  const paymentLabel = paymentVerified(order) ? "Verified" : (isSubmitted ? "Pending verification" : "Awaiting payment");
  const subject = isPaid ? `Payment verified for ${order.id}` : isSubmitted ? `Order placed · ${order.id}` : `Customer confirmed order ${order.id}`;
  const statusText = shippingPending
    ? `Items subtotal: ₹${itemSubtotal.toFixed(2)}. Delivery charge is awaiting the store quote; the final total is not set yet. Payment status: ${paymentLabel}.`
    : `${isPaid ? "Payment verified" : isSubmitted ? "Customer-reported amount" : "Order total"}: ₹${amount.toFixed(2)}. Payment status: ${paymentLabel}.`;
  const proofNotice = (isSubmitted || isLegacyPlaced) && order.payment_proof_sent_at
    ? (order.payment_proof_file_name
      ? `Customer uploaded payment proof (${clean(order.payment_proof_file_name, 160)}). Open the order invoice in Admin to view it, then verify the transfer in PhonePe before processing the order.`
      : "Customer reported sending payment proof and the order ID on WhatsApp. Verify the transfer in PhonePe before processing the order.")
    : "";
  const customer = order.customer_id ? await env.DB.prepare("SELECT name,email,mobile_number FROM users WHERE id=?").bind(order.customer_id).first() : null;
  const buyerName = clean(order.customer_name || customer?.name || address.name || "Customer", 160);
  const buyerEmail = clean(order.customer_email || customer?.email || address.email || "", 200);
  const buyerPhone = clean(order.customer_mobile_number || customer?.mobile_number || address.phone || "", 60);
  const addressText = [address.line, address.line2, address.landmark, address.city, address.state, address.pin ? `PIN ${address.pin}` : "", address.country]
    .map((part) => clean(part, 240)).filter(Boolean).join(", ");
  const itemLines = items.map((item) => {
    const code = clean(item.productCode || item.productId || "—", 120);
    const sku = clean(item.catalogueSku, 120);
    const name = clean(item.name, 160) || "Product";
    const variant = clean(item.variantLabel, 160);
    const qty = Number(item.qty) || 0;
    const price = Number(item.priceAtPurchase) || 0;
    return `Code: ${code}${sku ? ` | Catalogue SKU: ${sku}` : ""} | ${name}${variant && !variant.startsWith(code) ? ` (${variant})` : ""} | Qty: ${qty} | Unit: ₹${price.toFixed(2)} | Line total: ₹${(price * qty).toFixed(2)}`;
  });
  const text = [
    isPaid ? `Payment verified for order ${order.id}. The order is confirmed.` : isSubmitted ? `The customer placed order ${order.id} after uploading payment proof. Verify the transfer before processing.` : `The customer confirmed order ${order.id}. The order is now Placed.`,
    `Customer: ${buyerName}${buyerEmail ? ` | ${buyerEmail}` : ""}${buyerPhone ? ` | ${buyerPhone}` : ""}`,
    addressText ? `Delivery address: ${addressText}` : "",
    statusText,
    proofNotice,
    order.payment_reference_id ? `UPI transaction/reference ID: ${clean(order.payment_reference_id, 100)}` : "",
    itemLines.length ? `Items:\n${itemLines.join("\n")}` : "",
    `Items subtotal: ₹${itemSubtotal.toFixed(2)}`,
    discount ? `Discount: −₹${discount.toFixed(2)}` : "",
    shippingPending ? "Delivery: Awaiting store quote" : `Delivery: ${shipping === 0 ? "Free" : `₹${shipping.toFixed(2)}`}`,
    shippingPending ? "Final payable total: pending delivery quote" : `Final total: ₹${amount.toFixed(2)}`,
  ].filter(Boolean).join("\n\n");
  const rows = items.map((item) => {
    const code = clean(item.productCode || item.productId || "—", 120);
    const sku = clean(item.catalogueSku, 120);
    const name = clean(item.name, 160) || "Product";
    const variant = clean(item.variantLabel, 160);
    const qty = Number(item.qty) || 0;
    const price = Number(item.priceAtPurchase) || 0;
    return `<tr><td style="padding:7px 8px;border-bottom:1px solid #eee">${escapeHtml(code)}${sku ? `<br><small>SKU: ${escapeHtml(sku)}</small>` : ""}</td><td style="padding:7px 8px;border-bottom:1px solid #eee">${escapeHtml(name)}${variant && !variant.startsWith(code) ? `<br><small>${escapeHtml(variant)}</small>` : ""}</td><td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:center">${qty}</td><td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">₹${price.toFixed(2)}</td><td style="padding:7px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">₹${(price * qty).toFixed(2)}</td></tr>`;
  }).join("");
  const title = isPaid ? "Payment verified" : isSubmitted ? "Order placed · payment verification required" : "Customer confirmed order";
  const summary = isPaid ? "Payment verified by the store. The order is confirmed." : isSubmitted ? "The customer uploaded payment proof and confirmed the order. Verify the UPI transfer in PhonePe before processing it." : "The customer confirmed this order. Its status is now Placed.";
  const html = `<div style="font-family:Arial,sans-serif;color:#26231f;max-width:760px;margin:auto;padding:24px"><h2>${title}</h2><p><b>Order ID:</b> ${escapeHtml(order.id)}</p><p>${summary}</p><p>${escapeHtml(statusText)}</p>${proofNotice ? `<p><b>Payment proof:</b> ${escapeHtml(proofNotice)}</p>` : ""}${order.payment_reference_id ? `<p><b>UPI transaction/reference ID:</b> ${escapeHtml(clean(order.payment_reference_id, 100))}</p>` : ""}<h3>Customer</h3><p>${escapeHtml(buyerName)}${buyerEmail ? `<br>${escapeHtml(buyerEmail)}` : ""}${buyerPhone ? `<br>${escapeHtml(buyerPhone)}` : ""}${addressText ? `<br>${escapeHtml(addressText)}` : ""}</p><h3>Order invoice details</h3>${rows ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:7px 8px;background:#f2f5f2">Product code / SKU</th><th style="text-align:left;padding:7px 8px;background:#f2f5f2">Product</th><th style="padding:7px 8px;background:#f2f5f2">Qty</th><th style="text-align:right;padding:7px 8px;background:#f2f5f2">Unit price</th><th style="text-align:right;padding:7px 8px;background:#f2f5f2">Line total</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No item details available.</p>"}<table style="margin:14px 0 0 auto;border-collapse:collapse;min-width:260px"><tr><td style="padding:4px 8px">Items subtotal</td><td style="padding:4px 8px;text-align:right">₹${itemSubtotal.toFixed(2)}</td></tr>${discount ? `<tr><td style="padding:4px 8px">Discount</td><td style="padding:4px 8px;text-align:right">−₹${discount.toFixed(2)}</td></tr>` : ""}<tr><td style="padding:4px 8px">Delivery</td><td style="padding:4px 8px;text-align:right">${shippingPending ? "Awaiting store quote" : shipping === 0 ? "Free" : `₹${shipping.toFixed(2)}`}</td></tr><tr><td style="border-top:2px solid #2f8061;padding:9px 8px;font-weight:bold">${shippingPending ? "Final total pending" : "Final total"}</td><td style="border-top:2px solid #2f8061;padding:9px 8px;text-align:right;font-weight:bold">${shippingPending ? "Pending delivery quote" : `₹${amount.toFixed(2)}`}</td></tr></table><p style="color:#666;font-size:13px;margin-top:24px">UVID Art &amp; Craft Supplies</p></div>`;
  return sendTransactionalEmail(env, { to: email, subject, text, html });
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
  if (/^\/uploads\/[0-9a-f-]{36}(?:\?.*)?$/i.test(url)) return `${url.split("?")[0]}?v=3`;
  return value;
}
function resolvedProductImage(row, env) {
  const value = row.image_url ?? row.imageUrl;
  const raw = String(value || "");
  try {
    const image = new URL(raw);
    const storageBase = new URL(String(env?.SUPABASE_URL || ""));
    const managed = image.origin === storageBase.origin && image.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/uploads\/([0-9a-f-]{36})(?:\.[^/]+)?$/i);
    if (managed && decodeURIComponent(managed[1]) === supabaseBucket(env)) return `/uploads/${managed[2]}?v=3`;
  } catch { /* Keep non-managed and relative image URLs as supplied. */ }
  return versionedImageUrl(value);
}
function imageView(row, env) {
  return { id: row.id, productId: row.product_id, variantKey: row.variant_key || null,
    url: `/api/images/${row.id}?v=3`, mime: row.mime, byteSize: row.byte_size,
    width: row.width || null, height: row.height || null, altText: row.alt_text || null, sortOrder: row.sort_order };
}
function productView(row, images = [], env) {
  const meta = parseMeta(row);
  const variants = parseJson(row.variants_json, null);
  const variantStock = Array.isArray(variants) ? variants.reduce((n, v) => n + (Number(v.stock) || 0), 0) : null;
  const imageUrl = resolvedProductImage(row, env);
  const productImages = images.map((image) => imageView(image, env));
  return {
    id: row.id, productName: row.product_name, category: row.category, description: row.description,
    price: row.price, mrp: row.mrp, stockQuantity: row.stock_quantity,
    imageUrl, images: productImages, emoji: row.emoji || null,
    variantLabel: row.variant_label || null, variants: Array.isArray(variants) ? variants : undefined,
    status: row.status, inStock: row.status !== "OUT_OF_STOCK" && (variantStock === null ? row.stock_quantity > 0 : variantStock > 0),
    createdAt: row.created_at, updatedAt: row.updated_at,
    brand: meta.brand || null, rating: meta.rating ?? null, ratingCount: meta.ratingCount || 0,
    tags: Array.isArray(meta.tags) ? meta.tags : [], specs: meta.specs || null,
    highlights: Array.isArray(meta.highlights) ? meta.highlights : null,
    bg: meta.bg || null, ink: meta.ink || null, parent: meta.parent || null,
  };
}
async function codeProductStateMap(env, ids = CODE_PRODUCTS.map((product) => product.id)) {
  const selected = ids.filter((id) => CODE_PRODUCT_BY_ID.has(id));
  if (!selected.length) return new Map();
  const [soldResult, overrideResult] = await Promise.all([
    env.DB.prepare(`
    SELECT oi.product_id,COALESCE(SUM(oi.quantity),0) AS sold
    FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE oi.product_id IN (${selected.map(() => "?").join(",")}) AND o.status!='CANCELLED'
    GROUP BY oi.product_id
  `).bind(...selected).all(),
    env.DB.prepare(`SELECT product_id,price,stock_quantity FROM code_product_overrides WHERE product_id IN (${selected.map(() => "?").join(",")})`).bind(...selected).all(),
  ]);
  const soldRows = soldResult.results || [];
  const overrideRows = overrideResult.results || [];
  const soldById = new Map(soldRows.map((row) => [row.product_id, Number(row.sold) || 0]));
  const overrideById = new Map(overrideRows.map((row) => [row.product_id, row]));
  return new Map(selected.map((id) => {
    const product = CODE_PRODUCT_BY_ID.get(id);
    const override = overrideById.get(id);
    const sold = soldById.get(id) || 0;
    const stockBase = override?.stock_quantity == null ? Number(product.stockQuantity) : Number(override.stock_quantity);
    return [id, {
      price: override?.price == null ? Number(product.price) : Number(override.price),
      stockQuantity: Math.max(0, stockBase - sold),
      sold,
    }];
  }));
}
function codeProductView(product, state, admin = false) {
  const stockQuantity = Number(state?.stockQuantity) || 0;
  const price = Number(state?.price ?? product.price);
  return {
    ...product,
    price,
    mrp: Math.max(Number(product.mrp) || price, price),
    stockQuantity,
    status: stockQuantity > 0 ? "ACTIVE" : "OUT_OF_STOCK",
    inStock: stockQuantity > 0,
    ...(admin ? { codeManaged: true } : {}),
    variantLabel: null,
    variants: undefined,
    createdAt: null,
    updatedAt: null,
  };
}
function codeProductOrderRow(product, state) {
  const stockQuantity = Number(state?.stockQuantity) || 0;
  return {
    id: product.id,
    product_name: product.productName,
    category: product.category,
    description: product.description,
    price: Number(state?.price ?? product.price),
    mrp: Math.max(Number(product.mrp) || product.price, Number(state?.price ?? product.price)),
    stock_quantity: stockQuantity,
    image_url: product.imageUrl,
    emoji: product.emoji,
    variant_label: null,
    status: stockQuantity > 0 ? "ACTIVE" : "OUT_OF_STOCK",
    meta_json: JSON.stringify({
      brand: product.brand,
      highlights: product.highlights,
      specs: product.specs,
      tags: product.tags,
      rating: null,
      ratingCount: 0,
    }),
    codeManaged: true,
  };
}
async function updateCodeProduct(env, product, body, field = null) {
  const allowed = field === "stock" ? ["stockQuantity"] : field === "price" ? ["price"] : ["price", "stockQuantity"];
  if (Object.keys(body || {}).some((key) => !allowed.includes(key))) {
    throw Object.assign(new Error("Code-managed products allow price and stock edits here; names, photos, and category stay in the site code."), { status: 400 });
  }
  const state = (await codeProductStateMap(env, [product.id])).get(product.id);
  let price = Number(state?.price ?? product.price);
  let available = Number(state?.stockQuantity ?? product.stockQuantity);
  if (body.price !== undefined) {
    const next = Number(body.price);
    if (!Number.isFinite(next) || next < 0 || next > 10000000) throw Object.assign(new Error("Enter a valid product price."), { status: 400 });
    price = Math.round(next * 100) / 100;
  }
  if (body.stockQuantity !== undefined) {
    const next = Number(body.stockQuantity);
    if (!Number.isInteger(next) || next < 0 || next > 1000000) throw Object.assign(new Error("Stock must be a whole number 0 or higher."), { status: 400 });
    available = next;
  }
  const stockBaseline = available + Number(state?.sold || 0);
  await env.DB.prepare(`
    INSERT INTO code_product_overrides (product_id,price,stock_quantity,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(product_id) DO UPDATE SET price=excluded.price,stock_quantity=excluded.stock_quantity,updated_at=excluded.updated_at
  `).bind(product.id, price, stockBaseline, now()).run();
  return codeProductView(product, { price, stockQuantity: available }, true);
}
async function productRows(env, admin = false) {
  const sql = admin ? "SELECT * FROM products ORDER BY sort_order, product_name" : "SELECT * FROM products WHERE status IN ('ACTIVE','OUT_OF_STOCK') ORDER BY sort_order, product_name";
  const rows = (await env.DB.prepare(sql).all()).results || [];
  if (!rows.length) {
    if (!CODE_PRODUCTS.length) return [];
    const stateById = await codeProductStateMap(env);
    return CODE_PRODUCTS.map((product) => codeProductView(product, stateById.get(product.id), admin));
  }
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
  const products = rows.map((r) => productView(r, byProduct.get(r.id) || [], env));
  if (!CODE_PRODUCTS.length) return products;
  const stateById = await codeProductStateMap(env);
  return products.concat(CODE_PRODUCTS.map((product) => codeProductView(product, stateById.get(product.id), admin)));
}
async function categories(env) {
  const rows = (await env.DB.prepare(
    `SELECT c.slug,c.name,c.emoji,c.blurb,c.image_url,c.sort_order,c.parent_slug AS parentSlug,
       (SELECT COUNT(*) FROM products p WHERE p.status!='ARCHIVED' AND
         (p.category=c.slug OR p.category IN (SELECT child.slug FROM categories child WHERE child.parent_slug=c.slug))) AS count
     FROM categories c ORDER BY CASE WHEN c.parent_slug IS NULL THEN 0 ELSE 1 END,c.sort_order,c.name`).all()).results || [];
  if (rows.length) {
    const codeCounts = new Map();
    for (const product of CODE_PRODUCTS) codeCounts.set(product.category, (codeCounts.get(product.category) || 0) + 1);
    return rows.map((row) => ({
      ...row,
      image_url: resolvedProductImage(row, env),
      count: Number(row.count || 0) + (codeCounts.get(row.slug) || 0),
    }));
  }
  return (await env.DB.prepare("SELECT category AS slug,category AS name,COUNT(*) AS count FROM products WHERE status!='ARCHIVED' AND category!='uncategorized' GROUP BY category ORDER BY category").all()).results || [];
}
const slugify = (s) => clean(s, 120).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";

async function uniqueProductId(env, base) {
  const cleanBase = String(base || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";
  let id = cleanBase, n = 2;
  while (CODE_PRODUCT_BY_ID.has(id) || await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(id).first()) id = `${cleanBase}-${n++}`;
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
  if (!row) {
    const codeProduct = CODE_PRODUCT_BY_ID.get(id);
    if (!codeProduct) return null;
    const stateById = await codeProductStateMap(env, [id]);
    return codeProductView(codeProduct, stateById.get(id));
  }
  if (row.status === "ARCHIVED") return null;
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
function decodePaymentProof(body) {
  const encoded = String(body?.base64 || "");
  if (!encoded || encoded.length > 1_866_668 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw Object.assign(new Error("Choose a JPG, JPEG, PNG or WebP payment screenshot."), { status: 400 });
  }
  let binary;
  try { binary = atob(encoded); } catch { throw Object.assign(new Error("This payment proof file is invalid."), { status: 400 }); }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (!bytes.length) throw Object.assign(new Error("This payment proof file is empty."), { status: 400 });
  if (bytes.length > D1_IMAGE_LIMIT) throw Object.assign(new Error("Payment screenshots must be 1.4 MB or smaller."), { status: 413 });
  const reportedMime = clean(body?.mimeType, 120).toLowerCase().replace("image/jpg", "image/jpeg");
  const detectedMime = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
    : bytes.length > 8 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n) ? "image/png"
    : bytes.length > 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP" ? "image/webp"
    : null;
  if (!detectedMime || (reportedMime && reportedMime !== detectedMime)) {
    throw Object.assign(new Error("The file content must be a valid JPG, JPEG, PNG or WebP image."), { status: 400 });
  }
  const safeMime = detectedMime;
  const fileName = clean(body?.fileName, 220).replace(/[\\/]/g, "_").replace(/\.{2,}/g, ".") || "payment-proof";
  return { bytes, mime: safeMime, fileName };
}
function paymentProofResponse(row) {
  const bytes = imageBytes(row.data);
  let inlineMime = "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) inlineMime = "image/jpeg";
  else if (bytes.length > 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) inlineMime = "image/png";
  else if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") inlineMime = "image/webp";
  else if (String.fromCharCode(...bytes.slice(0, 4)) === "GIF8") inlineMime = "image/gif";
  else if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") inlineMime = "application/pdf";
  const fileName = clean(row.file_name, 220).replace(/[\\/\r\n]/g, "_") || "payment-proof";
  const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const inline = Boolean(inlineMime);
  return new Response(bytes, { headers: {
    "Content-Type": inline ? inlineMime : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="payment-proof"; filename*=UTF-8''${encodedName}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(bytes.length),
  } });
}
async function hashBytes(bytes) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((v) => v.toString(16).padStart(2, "0")).join(""); }
async function addProductImage(env, productId, body) {
  if (!(await env.DB.prepare("SELECT id FROM products WHERE id=?").bind(productId).first())) throw Object.assign(new Error("Product not found."), { status: 404 });
  const variant = clean(body.variantKey || body.variant || "", 100) || null;
  const { bytes, mime } = decodeImage(body.image || body.dataUri);
  let storage = null;
  try { storage = supabaseConfig(env); }
  catch (cause) { if (bytes.length > D1_IMAGE_LIMIT) throw cause; }
  if (!storage && bytes.length > D1_IMAGE_LIMIT) throw Object.assign(new Error("Connect Supabase Storage to upload photos larger than 1.4 MB."), { status: 413 });
  const sha = await hashBytes(bytes);
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM product_images WHERE product_id=?").bind(productId).first();
  if (Number(count?.n || 0) >= 24) throw Object.assign(new Error("This product already has 24 images."), { status: 409 });
  const dupe = await env.DB.prepare("SELECT i.*,o.storage_path FROM product_images i LEFT JOIN product_image_objects o ON o.image_id=i.id WHERE i.product_id=? AND COALESCE(i.variant_key,'')=COALESCE(?,'') AND i.sha256=?").bind(productId, variant, sha).first();
  if (dupe) return imageView(dupe, env);
  const order = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM product_images WHERE product_id=?").bind(productId).first();
  let storagePath = storage ? `products/${crypto.randomUUID()}.${mimeExtension(mime)}` : null;
  let imageUrl = null;
  if (storage) {
    try { imageUrl = await uploadSupabaseObject(env, storagePath, bytes, mime); }
    catch (cause) {
      if (bytes.length > D1_IMAGE_LIMIT) throw cause;
      storage = null;
      storagePath = null;
    }
  }
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
  const databaseProducts = await q("SELECT COUNT(*) n FROM products WHERE status!='ARCHIVED'");
  const databaseOutOfStock = await q("SELECT COUNT(*) n FROM products WHERE status!='ARCHIVED' AND (status='OUT_OF_STOCK' OR stock_quantity=0)");
  const codeState = await codeProductStateMap(env);
  const codeOutOfStock = CODE_PRODUCTS.filter((product) => (codeState.get(product.id)?.stockQuantity || 0) <= 0).length;
  const products = databaseProducts + CODE_PRODUCTS.length;
  const outOfStock = databaseOutOfStock + codeOutOfStock;
  const recentProducts = (await env.DB.prepare("SELECT id,product_name,category,price,stock_quantity,status,image_url,updated_at,emoji,meta_json FROM products WHERE status!='ARCHIVED' ORDER BY updated_at DESC,created_at DESC LIMIT 6").all()).results || [];
  for (const product of recentProducts) product.imageUrl = resolvedProductImage(product, env);
  const recentOrders = (await env.DB.prepare("SELECT o.id,o.total_amount,o.status,o.created_at,u.name AS customerName,u.mobile_number FROM orders o LEFT JOIN users u ON u.id=o.customer_id WHERE NOT (o.payment_method='UPI' AND o.payment_proof_sent_at IS NULL AND COALESCE(o.payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED') AND o.status!='CANCELLED') ORDER BY o.created_at DESC LIMIT 6").all()).results || [];
  return { products, inStock: products - outOfStock, outOfStock,
    lowStock: await q("SELECT COUNT(*) n FROM products WHERE stock_quantity>0 AND stock_quantity<=5 AND status!='ARCHIVED'") + CODE_PRODUCTS.filter((product) => { const n = codeState.get(product.id)?.stockQuantity || 0; return n > 0 && n <= 5; }).length,
    inactive: await q("SELECT COUNT(*) n FROM products WHERE status='ARCHIVED'"),
    orders: await q("SELECT COUNT(*) n FROM orders WHERE NOT (payment_method='UPI' AND payment_proof_sent_at IS NULL AND COALESCE(payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED') AND status!='CANCELLED')"),
    openOrders: await q("SELECT COUNT(*) n FROM orders WHERE (status IN ('AWAITING_PAYMENT_VERIFICATION','CONFIRMED','PLACED','PACKED','SHIPPED','OUT_FOR_DELIVERY') OR (payment_method='UPI' AND payment_proof_sent_at IS NOT NULL AND status='AWAITING_PAYMENT')) AND NOT (payment_method='UPI' AND payment_proof_sent_at IS NULL AND COALESCE(payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED') AND status!='CANCELLED')"),
    revenue: Number((await env.DB.prepare("SELECT COALESCE(SUM(total_amount),0) n FROM orders WHERE status!='CANCELLED' AND (payment_method!='UPI' OR payment_status IN ('PAID','VERIFIED'))").first())?.n || 0),
    customers: await q("SELECT COUNT(*) n FROM users WHERE role='CUSTOMER'"), recentProducts, recentOrders };
}
const REVENUE_ORDER_FILTER = "status!='CANCELLED' AND (payment_method!='UPI' OR payment_status IN ('PAID','VERIFIED'))";
function indiaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}
function addCalendarDays(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function indiaDayStartUtc(day) {
  return new Date(`${day}T00:00:00Z`).getTime() - 330 * 60 * 1000;
}
function sqlUtcDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
}
async function revenueReport(env, requestedMonth) {
  const todayParts = indiaDateParts();
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const currentMonth = today.slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(requestedMonth || "")) ? requestedMonth : currentMonth;
  const monthDate = new Date(`${month}-01T00:00:00Z`);
  const firstDay = `${month}-01`;
  const nextMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const todayUtc = indiaDayStartUtc(today);
  const tomorrowUtc = indiaDayStartUtc(addCalendarDays(today, 1));
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const weekStart = addCalendarDays(today, -((weekday + 6) % 7));
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const currentMonthDate = new Date(`${currentMonth}-01T00:00:00Z`);
  const currentNextMonth = new Date(Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  const range = (day) => indiaDayStartUtc(day);
  const totals = await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN created_at>=? AND created_at<? THEN total_amount ELSE 0 END),0) AS today,
      COALESCE(SUM(CASE WHEN created_at>=? AND created_at<? THEN total_amount ELSE 0 END),0) AS week,
      COALESCE(SUM(CASE WHEN created_at>=? AND created_at<? THEN total_amount ELSE 0 END),0) AS month,
      COALESCE(SUM(CASE WHEN created_at>=? AND created_at<? THEN total_amount ELSE 0 END),0) AS year
    FROM orders WHERE ${REVENUE_ORDER_FILTER}`)
    .bind(sqlUtcDate(todayUtc), sqlUtcDate(tomorrowUtc), sqlUtcDate(range(weekStart)), sqlUtcDate(tomorrowUtc), sqlUtcDate(range(yearStart)), sqlUtcDate(tomorrowUtc), sqlUtcDate(range(`${currentMonth}-01`)), sqlUtcDate(range(currentNextMonth))).first();
  const daily = (await env.DB.prepare(`SELECT date(created_at,'+5 hours','+30 minutes') AS day,COALESCE(SUM(total_amount),0) AS amount
    FROM orders WHERE ${REVENUE_ORDER_FILTER} AND created_at>=? AND created_at<?
    GROUP BY date(created_at,'+5 hours','+30 minutes') ORDER BY day`)
    .bind(sqlUtcDate(range(firstDay)), sqlUtcDate(range(nextMonth))).all()).results || [];
  return {
    month, today, weekStart, year: today.slice(0, 4),
    totals: { today: Number(totals?.today || 0), week: Number(totals?.week || 0), month: Number(totals?.month || 0), year: Number(totals?.year || 0) },
    daily: daily.map((row) => ({ day: row.day, amount: Number(row.amount || 0) })),
  };
}
async function orderList(env, customerId = null, status = null, includeCustomerDetails = false, visibility = "all", orderId = null) {
  const customerColumns = includeCustomerDetails ? ",u.name AS customer_name,u.email AS customer_email,u.mobile_number AS customer_mobile_number" : "";
  const customerJoin = includeCustomerDetails ? " LEFT JOIN users u ON u.id=o.customer_id" : "";
  const proofColumns = includeCustomerDetails
    ? ",CASE WHEN o.payment_proof_sent_at IS NOT NULL THEN pp.mime END AS payment_proof_mime,CASE WHEN o.payment_proof_sent_at IS NOT NULL THEN pp.file_name END AS payment_proof_file_name,CASE WHEN o.payment_proof_sent_at IS NOT NULL THEN pp.byte_size END AS payment_proof_byte_size,CASE WHEN o.payment_proof_sent_at IS NOT NULL THEN pp.created_at END AS payment_proof_created_at"
    : ",pp.mime AS payment_proof_mime,pp.file_name AS payment_proof_file_name,pp.byte_size AS payment_proof_byte_size,pp.created_at AS payment_proof_created_at";
  let sql = `SELECT o.*,COALESCE(q.finalized,1) AS shipping_finalized${customerColumns}${proofColumns} FROM orders o LEFT JOIN order_delivery_quotes q ON q.order_id=o.id${customerJoin} LEFT JOIN order_payment_proofs pp ON pp.order_id=o.id`, args = [];
  const filters = [];
  if (customerId != null) { filters.push("o.customer_id=?"); args.push(customerId); }
  if (status) { filters.push("o.status=?"); args.push(status); }
  if (orderId != null) { filters.push("o.id=?"); args.push(orderId); }
  if (visibility === "placed") filters.push("NOT (o.payment_method='UPI' AND o.payment_proof_sent_at IS NULL AND COALESCE(o.payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED') AND o.status!='CANCELLED')");
  if (visibility === "checkout-requests") filters.push("o.payment_method='UPI' AND o.status='AWAITING_PAYMENT' AND o.payment_proof_sent_at IS NULL AND COALESCE(o.payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED')");
  if (filters.length) sql += " WHERE " + filters.join(" AND ");
  sql += " ORDER BY o.created_at DESC LIMIT 200";
  const orders = (await env.DB.prepare(sql).bind(...args).all()).results || [];
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const customDesignColumns = includeCustomerDetails ? ",custom_design_json,CASE WHEN custom_design_image IS NOT NULL THEN 1 ELSE 0 END AS custom_design_image_available" : ",NULL AS custom_design_json,0 AS custom_design_image_available";
  const rows = (await env.DB.prepare(`SELECT oi.id,oi.order_id,oi.product_id,oi.product_name,oi.variant_label,oi.quantity,oi.price_at_purchase,oi.image_url,p.description AS catalog_description,p.meta_json AS catalog_meta_json${customDesignColumns} FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id IN (${ids.map(() => "?").join(",")}) ORDER BY oi.id`).bind(...ids).all()).results || [];
  const byOrder = new Map(); for (const row of rows) { const a = byOrder.get(row.order_id) || []; a.push(row); byOrder.set(row.order_id, a); }
  return orders.map((o) => ({ ...o, items: (byOrder.get(o.id) || []).map((item) => {
    const meta = parseJson(item.catalog_meta_json, {}) || {};
    const specs = meta.specs || {};
    const codes = orderItemCodes(item.catalog_meta_json, item.variant_label, item.product_id);
    return {
      ...item,
      product_code: codes.productCode,
      catalogue_sku: codes.catalogueSku || null,
      product_description: item.catalog_description || CODE_PRODUCT_BY_ID.get(item.product_id)?.description || null,
      hsn_code: meta.hsnCode || specs["HSN/SAC"] || specs["HSN Code"] || specs.HSN || null,
      gst_rate: meta.gstRate ?? specs["GST rate"] ?? specs["GST Rate"] ?? null,
      product_unit: meta.unit || specs.Unit || specs.UOM || null,
      image_url: resolvedProductImage({ image_url: item.image_url }, env),
    };
  }) }));
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
  const suppliedCheckoutToken = clean(body.checkoutToken, 80);
  const checkoutToken = /^[A-Za-z0-9_-]{20,80}$/.test(suppliedCheckoutToken)
    ? suppliedCheckoutToken
    : await hashBytes(encoder.encode(`uvid-checkout|${user.id}|${suppliedCheckoutToken}|${JSON.stringify({ items: body.items || [], address: body.address || {}, paymentMethod: body.paymentMethod || "UPI" })}`));
  const existing = await env.DB.prepare("SELECT id FROM orders WHERE customer_id=? AND checkout_token=?").bind(user.id, checkoutToken).first();
  if (existing) {
    const saved = (await orderList(env, user.id, null, true, "all", existing.id))[0];
    if (!saved) throw Object.assign(new Error("The saved checkout order could not be loaded. Refresh and try again."), { status: 409 });
    return { order: saved, idempotent: true, checkoutToken, items: saved.items.map((item) => ({
      productId: item.product_id, name: item.product_name, description: item.product_description || "", variantLabel: item.variant_label,
      qty: Number(item.quantity) || 0, priceAtPurchase: Number(item.price_at_purchase) || 0, imageUrl: item.image_url || "",
      productCode: item.product_code || item.product_id, catalogueSku: item.catalogue_sku || null, hsnCode: item.hsn_code || null,
      gstRate: item.gst_rate ?? null, unit: item.product_unit || null, customDesign: parseJson(item.custom_design_json, null),
    })) };
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length || items.length > 40) throw Object.assign(new Error("Add 1–40 items to the order."), { status: 400 });
  const suppliedAddress = body.address && typeof body.address === "object" ? body.address : {};
  const address = {
    name: clean(suppliedAddress.name, 120), phone: String(suppliedAddress.phone || "").replace(/\D/g, ""),
    email: clean(user.email, 200).toLowerCase(), line: clean(suppliedAddress.line, 300), city: clean(suppliedAddress.city, 100),
    state: clean(suppliedAddress.state, 100), pin: String(suppliedAddress.pin || "").replace(/\D/g, ""),
  };
  if (address.name.length < 2 || !/^\d{10}$/.test(address.phone) || address.line.length < 5 || !address.city || !/^\d{6}$/.test(address.pin)) {
    throw Object.assign(new Error("Enter your name, 10-digit mobile, complete address, city and 6-digit PIN."), { status: 400 });
  }
  const wants = new Map(), customDesigns = new Map();
  let seenCustomA4 = false;
  for (const item of items) {
    const id = clean(item.productId || item.id, 120); const qty = Number(item.quantity ?? item.qty);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 99) throw Object.assign(new Error("One of the cart items is invalid."), { status: 400 });
    if (id === CUSTOM_A4_PRODUCT_ID) {
      if (seenCustomA4) throw Object.assign(new Error("Keep the A4 design sheet as one cart item."), { status: 400 });
      seenCustomA4 = true;
      customDesigns.set(id, decodeCustomA4Design(item.customDesign, id));
    } else if (item.customDesign != null) {
      decodeCustomA4Design(item.customDesign, id);
    }
    wants.set(id, (wants.get(id) || 0) + qty);
  }
  const products = (await env.DB.prepare(`SELECT * FROM products WHERE id IN (${[...wants.keys()].map(() => "?").join(",")})`).bind(...wants.keys()).all()).results || [];
  const byId = new Map(products.map((p) => [p.id,p]));
  const codeStockById = await codeProductStateMap(env, [...wants.keys()]);
  let subtotal = 0; const lines = [];
  for (const [id, qty] of wants) {
    let p = byId.get(id);
    if (!p && CODE_PRODUCT_BY_ID.has(id)) p = codeProductOrderRow(CODE_PRODUCT_BY_ID.get(id), codeStockById.get(id));
    if (!p || p.status === "ARCHIVED") throw Object.assign(new Error("A cart item is no longer available."), { status: 409 });
    if (p.status === "OUT_OF_STOCK" || p.stock_quantity <= 0) throw Object.assign(new Error(`${p.product_name} is out of stock and cannot be purchased right now.`), { status: 409 });
    if (p.stock_quantity < qty) throw Object.assign(new Error(`Only ${p.stock_quantity} of ${p.product_name} are available.`), { status: 409 });
    subtotal += p.price * qty; lines.push({ p, qty, customDesign: customDesigns.get(id) || null });
  }
  const discount = 0;
  const shipping = 0;
  const method = String(body.paymentMethod || "UPI").toUpperCase();
  if (method !== "UPI") throw Object.assign(new Error("Only UPI QR payment is available."), { status: 400 });
  const batches = [
    env.DB.prepare("INSERT INTO order_id_counter (id,last_value) VALUES (1,1) ON CONFLICT(id) DO UPDATE SET last_value=last_value+1 RETURNING last_value"),
    env.DB.prepare("INSERT INTO orders (id,customer_id,total_amount,status,payment_method,payment_status,address_json,eta,coupon,discount,shipping,checkout_token) SELECT 'UVID'||printf('%03d',last_value),?,?, 'AWAITING_PAYMENT',?,?,?,?,?,?,?,? FROM order_id_counter WHERE id=1")
      .bind(user.id,Math.round((subtotal+shipping)*100)/100,method,"PENDING",JSON.stringify(address),new Date(Date.now()+3*86400000).toISOString().slice(0,10),null,discount,shipping,checkoutToken),
    env.DB.prepare("INSERT INTO order_delivery_quotes (order_id,finalized) SELECT 'UVID'||printf('%03d',last_value),0 FROM order_id_counter WHERE id=1")
  ];
  for (const line of lines) {
    batches.push(env.DB.prepare("INSERT INTO order_items (order_id,product_id,product_name,variant_label,quantity,price_at_purchase,image_url,custom_design_json,custom_design_image) SELECT 'UVID'||printf('%03d',last_value),?,?,?,?,?,?,?,? FROM order_id_counter WHERE id=1").bind(line.p.id,line.p.product_name,line.p.variant_label,line.qty,line.p.price,line.p.image_url,line.customDesign?.json||null,line.customDesign?.image||null));
    if (!line.p.codeManaged) batches.push(env.DB.prepare("UPDATE products SET stock_quantity=stock_quantity-?,status=CASE WHEN stock_quantity-?<=0 THEN 'OUT_OF_STOCK' ELSE status END,updated_at=? WHERE id=?").bind(line.qty,line.qty,now(),line.p.id));
  }
  let batchResults;
  try { batchResults = await env.DB.batch(batches); }
  catch (cause) {
    const duplicate = await env.DB.prepare("SELECT id FROM orders WHERE customer_id=? AND checkout_token=?").bind(user.id, checkoutToken).first();
    if (duplicate) {
      const saved = (await orderList(env, user.id, null, true, "all", duplicate.id))[0];
      if (saved) return { order: saved, idempotent: true, checkoutToken, items: saved.items.map((item) => ({
        productId: item.product_id, name: item.product_name, description: item.product_description || "", variantLabel: item.variant_label,
        qty: Number(item.quantity) || 0, priceAtPurchase: Number(item.price_at_purchase) || 0, imageUrl: item.image_url || "",
        productCode: item.product_code || item.product_id, catalogueSku: item.catalogue_sku || null, hsnCode: item.hsn_code || null,
        gstRate: item.gst_rate ?? null, unit: item.product_unit || null, customDesign: parseJson(item.custom_design_json, null),
      })) };
    }
    throw cause;
  }
  const orderNumber = Number(batchResults[0]?.results?.[0]?.last_value);
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) throw new Error("Could not allocate an order number.");
  const id = "UVID" + String(orderNumber).padStart(3, "0");
  return { order: (await orderList(env,user.id)).find((o) => o.id === id), checkoutToken, items: lines.map((l) => {
    const meta = parseJson(l.p.meta_json, {}) || {};
    const specs = meta.specs || {};
    return {
      ...orderItemCodes(l.p.meta_json, l.p.variant_label, l.p.id),
      productId:l.p.id,name:l.p.product_name,description:l.p.description || "",variantLabel:l.p.variant_label,qty:l.qty,priceAtPurchase:l.p.price,imageUrl:resolvedProductImage(l.p,env),
      hsnCode:meta.hsnCode || specs["HSN/SAC"] || specs["HSN Code"] || specs.HSN || null,
      gstRate:meta.gstRate ?? specs["GST rate"] ?? specs["GST Rate"] ?? null,
      unit:meta.unit || specs.Unit || specs.UOM || null,
      customDesign:l.customDesign?parseJson(l.customDesign.json,null):null,
    };
  }) };
}

async function orderEmailItems(env, orderId) {
  const rows = (await env.DB.prepare(`
    SELECT oi.product_id,oi.product_name,COALESCE(oi.variant_label,p.variant_label) AS variant_label,
      oi.quantity,oi.price_at_purchase,p.meta_json
    FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id
    WHERE oi.order_id=? ORDER BY oi.id
  `).bind(orderId).all()).results || [];
  return rows.map((item) => ({
    ...orderItemCodes(item.meta_json, item.variant_label, item.product_id),
    productId: item.product_id,
    variantLabel: item.variant_label,
    name: item.product_name,
    qty: item.quantity,
    priceAtPurchase: item.price_at_purchase,
  }));
}

async function handleApi(request, env, user, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;
  let body;
  const readBody = async () => { if (body === undefined) body = await bodyJson(request); return body; };
  const adminOnly = need(user, "ADMIN");
  const customerOnly = need(user, "CUSTOMER");

  if (path === "/api/auth/me" && method === "GET") return user ? json({ user }) : error("Not logged in.", 401);
  if (path === "/api/auth/logout" && method === "POST") return logoutResponse(CUSTOMER_COOKIE,LEGACY_COOKIE);
  if (path === "/api/auth/admin/logout" && method === "POST") return logoutResponse(ADMIN_COOKIE,LEGACY_COOKIE);
  if (path === "/api/auth/email/login" && method === "POST") {
    const b = await readBody(); const email = clean(b.email, 200).toLowerCase();
    if (!GMAIL_RE.test(email)) return error("Enter a valid Gmail address, such as name@gmail.com.");
    if (email === clean(env.ADMIN_EMAIL, 254).toLowerCase() || email === clean(env.ADMIN_USER_ID, 254).toLowerCase()) return error("This Gmail address is reserved for admin sign-in.",403);
    let row = await env.DB.prepare("SELECT id,email,name,role FROM users WHERE email=? COLLATE NOCASE").bind(email).first();
    if (row && row.role !== "CUSTOMER") return error("This Gmail address is reserved for admin sign-in.",403);
    if (!row) {
      const name = email.split("@")[0].replace(/[._+%-]+/g," ").trim() || "Customer";
      const out = await env.DB.prepare("INSERT INTO users (name,email,role) VALUES (?,?,'CUSTOMER')").bind(name,email).run();
      row = { id: out.meta?.last_row_id, email, name, role:"CUSTOMER" };
    }
    const token = await issueSession(env,{id:row.id,email:row.email,name:row.name,role:row.role});
    return json({ok:true,user:{id:row.id,email:row.email,name:row.name,role:row.role}},200,{"Set-Cookie":cookieHeader(token,604800,CUSTOMER_COOKIE)});
  }
  if (path === "/api/auth/admin/login" && method === "POST") {
    const b = await readBody();
    const userId = clean(b.userId, 254).toLowerCase();
    const password = typeof b.password === "string" ? b.password : "";
    const adminUserId = clean(env.ADMIN_USER_ID, 254).toLowerCase();
    if (!adminUserId || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || !env.SESSION_SECRET) {
      return error("Admin password sign-in is not configured. Set the admin ID and password in the secure Worker settings.",503);
    }
    if (password.length > 512) return error("Invalid admin ID or password.",401);

    const ip = clean(request.headers.get("CF-Connecting-IP") || "unknown", 100);
    const ipHash = b64url(await hmac(env.SESSION_SECRET, `admin-password-rate|${ip}`));
    const timestamp = Date.now();
    await env.DB.prepare("DELETE FROM admin_password_login_attempts WHERE updated_at_ms<?").bind(timestamp - 86400000).run();
    const attempts = await env.DB.prepare(`
      INSERT INTO admin_password_login_attempts(ip_hash,window_start_ms,request_count,updated_at_ms)
      VALUES(?,?,1,?)
      ON CONFLICT(ip_hash) DO UPDATE SET
        window_start_ms=CASE WHEN excluded.updated_at_ms-admin_password_login_attempts.window_start_ms>=900000 THEN excluded.updated_at_ms ELSE admin_password_login_attempts.window_start_ms END,
        request_count=CASE WHEN excluded.updated_at_ms-admin_password_login_attempts.window_start_ms>=900000 THEN 1 ELSE admin_password_login_attempts.request_count+1 END,
        updated_at_ms=excluded.updated_at_ms
      RETURNING request_count
    `).bind(ipHash,timestamp,timestamp).first();
    if (!attempts || Number(attempts.request_count) > 10) return error("Too many sign-in attempts. Wait 15 minutes and try again.",429);

    const suppliedHash = b64url(await hmac(env.SESSION_SECRET, `admin-password|${userId}|${password}`));
    const expectedHash = b64url(await hmac(env.SESSION_SECRET, `admin-password|${adminUserId}|${env.ADMIN_PASSWORD}`));
    if (!constantTimeEqual(suppliedHash, expectedHash)) return error("Invalid admin ID or password.",401);

    await env.DB.prepare("DELETE FROM admin_password_login_attempts WHERE ip_hash=?").bind(ipHash).run();
    const admin = {id:"admin",email:clean(env.ADMIN_EMAIL,254).toLowerCase(),name:"UVID Admin",role:"ADMIN"};
    const token = await issueSession(env,{...admin,authMethod:"password"});
    await audit(env,request,admin,"admin.login",null,{method:"password"});
    return json({ok:true,user:admin},200,{"Set-Cookie":cookieHeader(token,604800,ADMIN_COOKIE)});
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
    const addresses = (await env.DB.prepare("SELECT id,name,phone,line,city,state,pin,created_at AS createdAt FROM customer_addresses WHERE customer_id=? ORDER BY created_at DESC,id DESC").bind(user.id).all()).results || [];
    return json({addresses});
  }
  if (path === "/api/addresses" && method === "POST") {
    if (customerOnly) return customerOnly;
    const b = await readBody();
    const address = {
      id: crypto.randomUUID(), name: clean(b.name,120), phone: String(b.phone || "").replace(/\D/g,""),
      line: clean(b.line,300), city: clean(b.city,100), state: clean(b.state,100), pin: String(b.pin || "").replace(/\D/g,"")
    };
    if (address.name.length < 2) return error("Enter your full name.");
    if (!/^\d{10}$/.test(address.phone)) return error("Phone must be 10 digits.");
    if (address.line.length < 5) return error("Enter a complete street address.");
    if (!address.city) return error("Enter your city.");
    if (!/^\d{6}$/.test(address.pin)) return error("PIN must be 6 digits.");
    await env.DB.prepare("INSERT INTO customer_addresses (id,customer_id,name,phone,line,city,state,pin) VALUES (?,?,?,?,?,?,?,?)")
      .bind(address.id,user.id,address.name,address.phone,address.line,address.city,address.state,address.pin).run();
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
    const codeProduct = CODE_PRODUCT_BY_ID.get(id);
    if (codeProduct) {
      const product = await updateCodeProduct(env, codeProduct, update, match[2]);
      await audit(env,request,user,"product.update",id,{fields:Object.keys(update),source:"code-managed"});
      return json({ok:true,product});
    }
    const p=await updateProduct(env,id,update); await audit(env,request,user,"product.update",id,{fields:Object.keys(update)}); return json({ok:true,product:p});
  }
  if (match && method === "DELETE" && !match[2]) {
    if (adminOnly) return adminOnly; const id=decodeURIComponent(match[1]);
    if (CODE_PRODUCT_BY_ID.has(id)) return error("This code-managed product cannot be deleted from the admin panel.",409);
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
    const parentSlug=clean(b.parentSlug,40).toLowerCase()||null;
    if(parentSlug){const parent=await env.DB.prepare("SELECT slug,parent_slug FROM categories WHERE slug=?").bind(parentSlug).first();if(!parent)return error("Choose an existing main category as the parent.");if(parentSlug===slug||parent.parent_slug)return error("Subcategories can only be placed under a main category.");}
    try { await env.DB.prepare("INSERT INTO categories (slug,name,emoji,blurb,image_url,sort_order,parent_slug) VALUES (?,?,?,?,?,?,?)").bind(slug,name,clean(b.emoji,8)||null,clean(b.blurb,120)||null,clean(b.imageUrl,500)||null,Number(b.sortOrder)||100,parentSlug).run(); }
    catch { return error("A category with this name already exists.",409); }
    return json({ok:true,category:await env.DB.prepare("SELECT * FROM categories WHERE slug=?").bind(slug).first()},201);
  }
  match = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly; const slug=decodeURIComponent(match[1]), b=await readBody();
    const current=await env.DB.prepare("SELECT slug,parent_slug FROM categories WHERE slug=?").bind(slug).first();if(!current)return error("Category not found.",404);
    const cols={name:"name",emoji:"emoji",blurb:"blurb",imageUrl:"image_url",sortOrder:"sort_order"}; const sets=[],args=[];
    for(const [input,col] of Object.entries(cols)) if(b[input]!==undefined){sets.push(`${col}=?`);args.push(input==="sortOrder"?Number(b[input]):clean(b[input],input==="name"?40:500)||null);}
    if(b.parentSlug!==undefined){const parentSlug=clean(b.parentSlug,40).toLowerCase()||null;if(parentSlug===slug)return error("A category cannot be its own parent.");if(parentSlug){const parent=await env.DB.prepare("SELECT slug,parent_slug FROM categories WHERE slug=?").bind(parentSlug).first();if(!parent)return error("Choose an existing main category as the parent.");if(parent.parent_slug)return error("Subcategories can only be placed under a main category.");}const children=await env.DB.prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_slug=?").bind(slug).first();if(Number(children?.n||0)>0&&parentSlug)return error("Move or delete this category's subcategories before making it a subcategory.",409);sets.push("parent_slug=?");args.push(parentSlug);}
    if(!sets.length) return error("Nothing to update."); args.push(now(),slug);
    await env.DB.prepare(`UPDATE categories SET ${sets.join(",")},updated_at=? WHERE slug=?`).bind(...args).run();
    return json({ok:true,category:await env.DB.prepare("SELECT * FROM categories WHERE slug=?").bind(slug).first()});
  }
  if (match && method === "DELETE") {
    if (adminOnly) return adminOnly; const slug=decodeURIComponent(match[1]), b=await readBody().catch(()=>({}));
    const childCount=await env.DB.prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_slug=?").bind(slug).first();if(Number(childCount?.n||0)>0)return error("Move or delete this category's subcategories before deleting it.",409);
    const used=await env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE category=? AND status!='ARCHIVED'").bind(slug).first();
    if(Number(used?.n||0)>0){ if(!b.reassignTo) return error("Move the category's products first.",409);const target=clean(b.reassignTo,40).toLowerCase();if(!target||target===slug||!(await env.DB.prepare("SELECT slug FROM categories WHERE slug=?").bind(target).first()))return error("Choose another existing category for these products.");await env.DB.prepare("UPDATE products SET category=?,updated_at=? WHERE category=?").bind(target,now(),slug).run(); }
    await env.DB.prepare("DELETE FROM categories WHERE slug=?").bind(slug).run(); return json({ok:true,moved:Number(used?.n||0)});
  }
  if (path === "/api/admin/upload" && method === "POST") {
    if (adminOnly) return adminOnly;
    const b = await readBody(); const { bytes, mime } = decodeImage(b.image); const id = crypto.randomUUID();
    let storage = null;
    try { storage = supabaseConfig(env); }
    catch (cause) { if (bytes.length > D1_IMAGE_LIMIT) throw cause; }
    if (storage) {
      const storagePath = `uploads/${id}.${mimeExtension(mime)}`;
      let imageUrl = null;
      try { imageUrl = await uploadSupabaseObject(env, storagePath, bytes, mime); }
      catch (cause) { if (bytes.length > D1_IMAGE_LIMIT) throw cause; }
      if (imageUrl) {
        try {
          await env.DB.prepare("INSERT INTO uploaded_image_objects (id,storage_path,mime,byte_size) VALUES (?,?,?,?)")
            .bind(id, storagePath, mime, bytes.length).run();
        } catch (cause) {
          await deleteSupabaseObject(env, storagePath).catch(() => {});
          throw cause;
        }
        return json({ ok: true, url: `/uploads/${id}?v=3` }, 201);
      }
    }
    if (bytes.length > D1_IMAGE_LIMIT) throw Object.assign(new Error("Connect Supabase Storage to upload photos larger than 1.4 MB."), { status: 413 });
    await env.DB.prepare("INSERT INTO uploaded_images (id,mime,byte_size,data) VALUES (?,?,?,?)").bind(id,mime,bytes.length,bytes).run();
    return json({ok:true,url:`/uploads/${id}`},201);
  }
  if (path === "/api/admin/stats" && method === "GET") return adminOnly || json({stats:await stats(env)});
  if (path === "/api/admin/revenue" && method === "GET") return adminOnly || json({ report: await revenueReport(env, url.searchParams.get("month")) });
  if (path === "/api/admin/orders" && method === "GET") {
    if (adminOnly) return adminOnly;
    const requestedStatus = url.searchParams.get("status");
    const orders = await orderList(env,null,requestedStatus === "PLACED" ? null : requestedStatus,true,"placed");
    return json({orders:requestedStatus === "PLACED" ? orders.filter((order) => order.status === "PLACED" || order.status === "CONFIRMED") : orders});
  }
  if (path === "/api/admin/checkout-requests" && method === "GET") return adminOnly || json({orders:[]});
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/payment-proof$/);
  if (match && method === "GET") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const order = await env.DB.prepare("SELECT payment_proof_sent_at FROM orders WHERE id=?").bind(id).first();
    if (!order || !order.payment_proof_sent_at) return error("No customer-submitted payment proof is available for this order.",404);
    const proof = await env.DB.prepare("SELECT mime,file_name,byte_size,data,created_at FROM order_payment_proofs WHERE order_id=?").bind(id).first();
    if (!proof) return error("No payment proof has been uploaded for this order.",404);
    return paymentProofResponse(proof);
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/items\/(\d+)\/custom-design-image$/);
  if (match && method === "GET") {
    if (adminOnly) return adminOnly;
    const orderId = decodeURIComponent(match[1]);
    const itemId = Number(match[2]);
    const item = await env.DB.prepare("SELECT custom_design_image FROM order_items WHERE id=? AND order_id=?").bind(itemId,orderId).first();
    if (!item?.custom_design_image) return error("No saved A4 design image is available for this order item.",404);
    const bytes = imageBytes(item.custom_design_image);
    if (bytes.length < 8 || ![137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte)) return error("The saved A4 design image is invalid.",500);
    return new Response(bytes,{headers:{"Content-Type":"image/png","Content-Disposition":"inline; filename=customer-a4-design.png","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Length":String(bytes.length)}});
  }
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
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/delivery$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const b = await readBody();
    if (b.shipping === null || b.shipping === undefined || String(b.shipping).trim() === "") return error("Enter a delivery charge, or enter 0 for free delivery.");
    const value = Number(b.shipping);
    if (!Number.isFinite(value) || value < 0 || value > 10000000) return error("Delivery charge must be between ₹0 and ₹10,000,000.");
    const requestedShipping = Math.round(value * 100) / 100;
    const current = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!current) return error("Order not found.",404);
    if (current.status === "CANCELLED") return error("A cancelled order cannot be repriced.",409);
    if (paymentVerified(current)) return error("This order is already paid, so its delivery charge cannot be changed.",409);
    if (current.payment_proof_sent_at && current.payment_status !== "REJECTED") return error("This order's payment proof is already submitted. Its delivery charge cannot be changed now.",409);
    const amounts = await env.DB.prepare("SELECT COALESCE(SUM(price_at_purchase*quantity),0) AS subtotal FROM order_items WHERE order_id=?").bind(id).first();
    const subtotal = Number(amounts?.subtotal || 0);
    const shipping = subtotal > 5000 ? 0 : requestedShipping;
    const total = Math.round((subtotal - Number(current.discount || 0) + shipping) * 100) / 100;
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET shipping=?,total_amount=?,updated_at=? WHERE id=?").bind(shipping,total,timestamp,id),
      env.DB.prepare("INSERT INTO order_delivery_quotes (order_id,finalized,updated_at) VALUES (?,1,?) ON CONFLICT(order_id) DO UPDATE SET finalized=1,updated_at=excluded.updated_at").bind(id,timestamp)
    ]);
    await audit(env,request,user,"order.delivery_quote_saved",id,{shipping,total});
    return json({ok:true,order:(await orderList(env,null,null,true)).find((item)=>item.id===id)});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/payment\/reject$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const b = await readBody();
    const reason = clean(b.reason, 1000);
    if (reason.length < 5) return error("Enter a clear reason of at least 5 characters for the customer.");
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!order) return error("Order not found.",404);
    if (order.status === "CANCELLED" || paymentVerified(order)) return error("This payment can no longer be rejected.",409);
    if (!["PENDING_VERIFICATION","PENDING"].includes(order.payment_status) || !order.payment_proof_sent_at) return error("The customer has not submitted payment proof for review.",409);
    const timestamp = now();
    const result = await env.DB.prepare("UPDATE orders SET status='AWAITING_PAYMENT_VERIFICATION',payment_status='REJECTED',payment_rejection_reason=?,payment_verified_at=NULL,updated_at=? WHERE id=? AND payment_status IN ('PENDING_VERIFICATION','PENDING') AND payment_proof_sent_at IS NOT NULL")
      .bind(reason,timestamp,id).run();
    if (!Number(result.meta?.changes || 0)) return error("This payment changed while you were reviewing it. Refresh the order and try again.",409);
    await audit(env,request,user,"order.payment_rejected",id,{reason});
    return json({ok:true,order:(await orderList(env,null,null,true)).find((item)=>item.id===id)});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/payment$/);
  if (match && method === "PUT") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!order) return error("Order not found.",404);
    if (order.payment_method !== "UPI") return error("This order is not a UPI payment.",409);
    if (order.status === "CANCELLED") return error("A cancelled order cannot be marked paid.",409);
    const paymentProof = await env.DB.prepare("SELECT order_id FROM order_payment_proofs WHERE order_id=?").bind(id).first();
    if (order.payment_status === "REJECTED") return error("The customer needs to upload and submit a replacement payment screenshot first.",409);
    if (!paymentVerified(order) && (!paymentProof || !order.payment_proof_sent_at || !["PENDING_VERIFICATION","PENDING"].includes(order.payment_status))) return error("The customer has not submitted payment proof for verification yet.",409);
    const quote = await env.DB.prepare("SELECT finalized FROM order_delivery_quotes WHERE order_id=?").bind(id).first();
    if (quote && Number(quote.finalized) !== 1) return error("Set the delivery charge before confirming payment.",409);
    const alreadyPaid = paymentVerified(order);
    const verifiedAt = now();
    await env.DB.prepare("UPDATE orders SET payment_status='VERIFIED',status=CASE WHEN status IN ('AWAITING_PAYMENT','AWAITING_PAYMENT_VERIFICATION','PLACED','CONFIRMED') THEN 'PLACED' ELSE status END,payment_verified_at=COALESCE(payment_verified_at,?),payment_rejection_reason=NULL,updated_at=? WHERE id=?")
      .bind(verifiedAt,verifiedAt,id).run();
    await audit(env,request,user,"order.payment_confirmed",id,{method:order.payment_method,paymentStatus:"VERIFIED",verifiedAt});
    const notification = alreadyPaid
      ? { sent: false, count: 0, reason: "already_paid" }
      : await sendPaidOrderPush(env, order, parseJson(order.address_json, {}).name || "Customer");
    const emailItems = alreadyPaid ? [] : await orderEmailItems(env,id);
    const emailNotification = alreadyPaid
      ? { sent: false, reason: "already_paid" }
      : await sendOrderEmail(env,{...order,status:"CONFIRMED",payment_status:"VERIFIED",payment_verified_at:verifiedAt},"paid",emailItems);
    if(!emailNotification.sent && !alreadyPaid) console.warn("[ORDER EMAIL] Payment confirmation was not delivered.",emailNotification.reason);
    return json({ok:true,notification,emailNotification,order:(await orderList(env,null,null,true)).find((item)=>item.id===id)});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/push$/);
  if (match && method === "POST") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!order) return error("Order not found.",404);
    if (!paymentVerified(order)) return error("Confirm the payment before sending a paid-order notification.",409);
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
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/email$/);
  if (match && method === "POST") {
    if (adminOnly) return adminOnly;
    const id = decodeURIComponent(match[1]);
    const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
    if (!order) return error("Order not found.",404);
    if (order.status === "CANCELLED") return error("A cancelled order cannot receive an order email.",409);
    if (order.payment_method === "UPI" && !paymentVerified(order) && !order.payment_proof_sent_at) return error("The customer must submit a payment screenshot before an order email can be sent.",409);
    const quote = await env.DB.prepare("SELECT finalized FROM order_delivery_quotes WHERE order_id=?").bind(id).first();
    const items = await orderEmailItems(env,id);
    const type = paymentVerified(order) ? "paid" : order.payment_status === "PENDING_VERIFICATION" ? "submitted" : "placed";
    const emailNotification = await sendOrderEmail(env,{...order,shipping_finalized:Number(quote?.finalized ?? 1)},type,items);
    if (!emailNotification.sent) {
      const message = emailNotification.reason === "not_configured"
        ? "Email delivery is not configured on the server yet."
        : "The email could not be delivered. Check the email service and try again.";
      return error(message,emailNotification.reason === "not_configured" ? 503 : 502);
    }
    await audit(env,request,user,"order.email_sent",id,{type});
    return json({ok:true,emailNotification});
  }
  match = path.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if(match && method === "PUT"){
    if(adminOnly) return adminOnly; const b=await readBody(),status=clean(b.status,30).toUpperCase();
    if(!["AWAITING_PAYMENT","AWAITING_PAYMENT_VERIFICATION","CONFIRMED","PLACED","PACKED","SHIPPED","OUT_FOR_DELIVERY","DELIVERED","CANCELLED"].includes(status)) return error("Invalid order status.");
    const orderId = decodeURIComponent(match[1]);
    const current = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(orderId).first();
    if (!current) return error("Order not found.",404);
    if (current.payment_method === "UPI" && !paymentVerified(current) && status !== "CANCELLED") return error("Verify the UPI payment after checking the transaction before progressing this order.",409);
    const timestamp=now();
    const statusUpdate=env.DB.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?").bind(status,timestamp,orderId);
    if (status === "CANCELLED" && current.status !== "CANCELLED") {
      const items = (await env.DB.prepare("SELECT product_id,quantity FROM order_items WHERE order_id=?").bind(orderId).all()).results || [];
      const batches = [statusUpdate];
      for (const item of items) batches.push(env.DB.prepare("UPDATE products SET stock_quantity=stock_quantity+?,status=CASE WHEN status='OUT_OF_STOCK' AND stock_quantity+?>0 THEN 'ACTIVE' ELSE status END,updated_at=? WHERE id=?").bind(item.quantity,item.quantity,now(),item.product_id));
      const results=await env.DB.batch(batches);
      if(Number(results[0]?.meta?.changes||0)!==1) return error("The order status was not saved. Refresh the order and try again.",409);
      await audit(env,request,user,"order.status_changed",orderId,{status});
      return json({ok:true,status,updated_at:timestamp});
    }
    const saved=await statusUpdate.run();
    if(Number(saved.meta?.changes||0)!==1) return error("The order status was not saved. Refresh the order and try again.",409);
    await audit(env,request,user,"order.status_changed",orderId,{status});
    return json({ok:true,status,updated_at:timestamp});
  }
  if(path==="/api/admin/customers" && method==="GET") return adminOnly || json({customers:(await env.DB.prepare(`
    SELECT u.id,
      COALESCE(NULLIF(json_extract(CASE WHEN json_valid(o.address_json) THEN o.address_json ELSE '{}' END,'$.name'),''),NULLIF(a.name,''),u.name) AS name,
      u.email,
      COALESCE(NULLIF(json_extract(CASE WHEN json_valid(o.address_json) THEN o.address_json ELSE '{}' END,'$.phone'),''),NULLIF(u.mobile_number,''),a.phone) AS mobile_number,
      COALESCE(NULLIF(json_extract(CASE WHEN json_valid(o.address_json) THEN o.address_json ELSE '{}' END,'$.line'),''),a.line) AS address_line,
      COALESCE(NULLIF(json_extract(CASE WHEN json_valid(o.address_json) THEN o.address_json ELSE '{}' END,'$.city'),''),a.city) AS address_city,
      COALESCE(NULLIF(json_extract(CASE WHEN json_valid(o.address_json) THEN o.address_json ELSE '{}' END,'$.pin'),''),a.pin) AS address_pin,
      (SELECT COUNT(*) FROM orders WHERE customer_id=u.id AND NOT (payment_method='UPI' AND payment_proof_sent_at IS NULL AND COALESCE(payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED') AND status!='CANCELLED')) AS orderCount,
      (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE customer_id=u.id AND NOT (payment_method='UPI' AND payment_proof_sent_at IS NULL AND COALESCE(payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED') AND status!='CANCELLED')) AS spend,
      u.created_at
    FROM users u
    LEFT JOIN customer_addresses a ON a.id=(SELECT id FROM customer_addresses WHERE customer_id=u.id ORDER BY created_at DESC,id DESC LIMIT 1)
    LEFT JOIN orders o ON o.id=(SELECT id FROM orders WHERE customer_id=u.id AND NOT (payment_method='UPI' AND payment_proof_sent_at IS NULL AND COALESCE(payment_status,'PENDING') NOT IN ('PAID','VERIFIED','REJECTED') AND status!='CANCELLED') ORDER BY created_at DESC,id DESC LIMIT 1)
    WHERE u.role='CUSTOMER' ORDER BY u.created_at DESC
  `).all()).results||[]});
  if(path==="/api/admin/audit" && method==="GET") return adminOnly || json({entries:(await env.DB.prepare("SELECT * FROM audit_logs WHERE action NOT IN ('order.payment_proof_uploaded','order.payment_proof_removed') ORDER BY created_at DESC LIMIT ?").bind(Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||25))).all()).results||[]});
  if(path==="/api/admin/seminar" && method==="GET") return adminOnly || json({seminar:await env.DB.prepare("SELECT * FROM seminar_details WHERE id=1").first(),registrations:(await env.DB.prepare("SELECT * FROM seminar_registrations ORDER BY created_at DESC LIMIT 500").all()).results||[]});
  if(path==="/api/admin/seminar/details" && method==="POST"){
    if(adminOnly) return adminOnly; const b=await readBody();
    await env.DB.prepare("UPDATE seminar_details SET title=?,description=?,event_date=?,event_time=?,location=?,meeting_url=?,speaker=?,agenda=?,contact_email=?,updated_at=? WHERE id=1")
      .bind(clean(b.title,200),clean(b.description,2000),clean(b.date,100),clean(b.time,100),clean(b.location,300),clean(b.meetingUrl,500),clean(b.speaker,200),Array.isArray(b.agenda)?b.agenda.map(x=>clean(x,200)).join("\n"):clean(b.agenda,2000),clean(b.contactEmail,200),now()).run();
    return json({ok:true});
  }

  if(path==="/api/orders" && method==="POST"){
    if(customerOnly) return customerOnly;
    const out=await placeOrder(env,user,await readBody());
    return json({ok:true,...out,emailNotification:{sent:false,reason:"awaiting_customer_payment_proof_confirmation"}},201);
  }
  if(path==="/api/orders" && method==="GET") return customerOnly || json({orders:await orderList(env,user.id)});
  match=path.match(/^\/api\/orders\/([^/]+)\/payment-proof$/);
  if(match && ["GET","POST","DELETE"].includes(method)){
    if(customerOnly) return customerOnly;
    const id=decodeURIComponent(match[1]);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").bind(id,user.id).first();
    if(!order) return error("Order not found.",404);
    if(order.payment_method!=="UPI") return error("This order is not a UPI payment.",409);
    if(method==="GET"){
      const proof=await env.DB.prepare("SELECT mime,file_name,byte_size,data,created_at FROM order_payment_proofs WHERE order_id=?").bind(id).first();
      if(!proof) return error("No payment screenshot is available for this order.",404);
      return paymentProofResponse(proof);
    }
    if(order.status==="CANCELLED") return error("A cancelled order cannot receive payment proof.",409);
    if(paymentVerified(order)) return error("This order's payment is already verified.",409);
    if(!["AWAITING_PAYMENT","AWAITING_PAYMENT_VERIFICATION","PLACED"].includes(order.status)) return error("This order can no longer receive payment proof.",409);
    if(method==="DELETE"){
      if(order.payment_proof_sent_at && order.payment_status!=="REJECTED") return error("A submitted payment screenshot cannot be removed while it is under review.",409);
      const removed=await env.DB.prepare("DELETE FROM order_payment_proofs WHERE order_id=?").bind(id).run();
      if(!Number(removed.meta?.changes||0)) return error("No uploaded payment screenshot was found.",404);
      return json({ok:true,order:(await orderList(env,user.id)).find((item)=>item.id===id)});
    }
    const b=await bodyJson(request,1_950_000);
    const {bytes,mime,fileName}=decodePaymentProof(b);
    if(order.payment_proof_sent_at && order.payment_status!=="REJECTED") return error("This payment screenshot is already submitted for verification.",409);
    const timestamp=now();
    await env.DB.prepare("INSERT INTO order_payment_proofs (order_id,mime,file_name,byte_size,data,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET mime=excluded.mime,file_name=excluded.file_name,byte_size=excluded.byte_size,data=excluded.data,created_at=excluded.created_at")
      .bind(id,mime,fileName,bytes.length,bytes,timestamp).run();
    if(order.payment_status==="REJECTED") await env.DB.prepare("UPDATE orders SET payment_proof_sent_at=NULL,updated_at=? WHERE id=? AND customer_id=?").bind(timestamp,id,user.id).run();
    const savedOrder=(await orderList(env,user.id)).find((item)=>item.id===id);
    return json({ok:true,order:savedOrder});
  }
  match=path.match(/^\/api\/orders\/([^/]+)\/confirm-payment-proof$/);
  if(match && method==="POST"){
    if(customerOnly) return customerOnly;
    const id=decodeURIComponent(match[1]);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").bind(id,user.id).first();
    if(!order) return error("Order not found.",404);
    if(order.payment_method!=="UPI") return error("This order is not a UPI payment.",409);
    if(order.status==="CANCELLED") return error("A cancelled order cannot be confirmed.",409);
    if(paymentVerified(order)) return error("This order's payment is already verified.",409);
    if(order.payment_status==="PENDING_VERIFICATION" && order.payment_proof_sent_at){
      return json({ok:true,alreadySubmitted:true,order:(await orderList(env,user.id)).find((item)=>item.id===id)});
    }
    if(!["AWAITING_PAYMENT","AWAITING_PAYMENT_VERIFICATION","PLACED"].includes(order.status)) return error("This order can no longer be submitted.",409);
    const proof=await env.DB.prepare("SELECT order_id,file_name FROM order_payment_proofs WHERE order_id=?").bind(id).first();
    if(!proof) return error("Upload your payment proof file before confirming the order.",409);
    const b=await readBody();
    const paymentReferenceId=clean(b.paymentReferenceId || b.referenceId,100).replace(/[^A-Za-z0-9\-_/ .]/g,"") || null;
    const timestamp=now();
    const updated=await env.DB.prepare("UPDATE orders SET status='PLACED',payment_status='PENDING_VERIFICATION',payment_reference_id=?,payment_verified_at=NULL,payment_rejection_reason=NULL,payment_proof_sent_at=?,updated_at=? WHERE id=? AND customer_id=? AND status IN ('AWAITING_PAYMENT','AWAITING_PAYMENT_VERIFICATION','PLACED') AND payment_status NOT IN ('PAID','VERIFIED') AND payment_proof_sent_at IS NULL")
      .bind(paymentReferenceId,timestamp,timestamp,id,user.id).run();
    if(!Number(updated.meta?.changes||0)){
      const current=await env.DB.prepare("SELECT payment_status,payment_proof_sent_at FROM orders WHERE id=? AND customer_id=?").bind(id,user.id).first();
      if(current?.payment_status==="PENDING_VERIFICATION" && current.payment_proof_sent_at) return json({ok:true,alreadySubmitted:true,order:(await orderList(env,user.id)).find((item)=>item.id===id)});
      return error("This order was already submitted or changed. Refresh the page to see its latest status.",409);
    }
    await audit(env,request,user,"order.payment_proof_confirmed",id,{fileName:proof.file_name||null,paymentReferenceId});
    const savedOrder=(await orderList(env,user.id)).find((item)=>item.id===id);
    let emailNotification={sent:false,reason:"notification_error"};
    try {
      emailNotification=await sendOrderEmail(env,savedOrder,"submitted",await orderEmailItems(env,id));
      if(!emailNotification.sent) console.warn("[ORDER EMAIL] Customer-submitted order notification was not delivered.",emailNotification.reason);
    } catch (cause) {
      console.warn("[ORDER EMAIL] Customer-submitted order notification could not be prepared.",cause?.name||"notification error");
    }
    return json({ok:true,emailNotification,order:savedOrder});
  }
  match=path.match(/^\/api\/orders\/([^/]+)(?:\/cancel)?$/);
  if(match && method==="POST" && path.endsWith("/cancel")){
    if(customerOnly) return customerOnly; const id=decodeURIComponent(match[1]);
    const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND customer_id=?").bind(id,user.id).first();
    if(!order) return error("Order not found.",404); if(!["AWAITING_PAYMENT","AWAITING_PAYMENT_VERIFICATION","PLACED"].includes(order.status) || paymentVerified(order)) return error("This order can no longer be cancelled.",409);
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

async function fetchSupabaseImage(request, env, storagePath, mime) {
  const url = supabaseObjectUrl(env, storagePath);
  if (!url) return error("Image storage is not configured.", 503);
  let stored;
  try {
    stored = await fetch(url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
  } catch (e) {
    console.error("[UVID image storage] Image fetch failed", e?.message || e);
    return error("The stored image is temporarily unavailable.", 502);
  }
  if (!stored.ok) {
    if (stored.status === 404) return null;
    console.error("[UVID image storage] Image fetch returned", stored.status);
    return error("The stored image is temporarily unavailable.", 502);
  }
  const headers = {
    "Content-Type": mime || stored.headers.get("Content-Type") || "application/octet-stream",
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  };
  const length = stored.headers.get("Content-Length");
  const etag = stored.headers.get("ETag");
  if (length) headers["Content-Length"] = length;
  if (etag) headers.ETag = etag;
  return new Response(request.method === "HEAD" ? null : stored.body, { headers });
}

async function serveImage(request, env, path) {
  const imageMatch = path.match(/^\/api\/images\/(\d+)$/);
  if (imageMatch && ["GET", "HEAD"].includes(request.method)) {
    const external = await env.DB.prepare("SELECT o.storage_path FROM product_image_objects o WHERE o.image_id=?").bind(Number(imageMatch[1])).first();
    if (external?.storage_path) {
      const image = await env.DB.prepare("SELECT mime FROM product_images WHERE id=?").bind(Number(imageMatch[1])).first();
      const response = await fetchSupabaseImage(request, env, external.storage_path, image?.mime);
      if (response) return response;
    }
    const row = await env.DB.prepare("SELECT b.mime,b.data FROM product_images i JOIN image_blobs b ON b.sha256=i.sha256 WHERE i.id=?").bind(Number(imageMatch[1])).first();
    if (!row) return error("Image not found.",404);
    return new Response(request.method === "HEAD" ? null : imageBytes(row.data),{headers:{"Content-Type":row.mime,"Cache-Control":"public,max-age=86400","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}});
  }
  const upload = path.match(/^\/uploads\/([0-9a-f-]{36})$/i);
  if (upload && ["GET", "HEAD"].includes(request.method)) {
    const external = await env.DB.prepare("SELECT storage_path,mime FROM uploaded_image_objects WHERE id=?").bind(upload[1]).first();
    if (external?.storage_path) {
      const response = await fetchSupabaseImage(request, env, external.storage_path, external.mime);
      if (response) return response;
    }
    const row = await env.DB.prepare("SELECT mime,data FROM uploaded_images WHERE id=?").bind(upload[1]).first();
    if (!row) return error("Image not found.",404);
    return new Response(request.method === "HEAD" ? null : imageBytes(row.data),{headers:{"Content-Type":row.mime,"Cache-Control":"public,max-age=86400","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}});
  }
  return null;
}

function publicCatalogCacheKey(request, path, url) {
  if (request.method !== "GET" || url.search) return null;
  if (path !== "/api/products" && path !== "/api/products/categories") return null;
  const keyUrl = new URL(request.url);
  keyUrl.searchParams.set("__uvid_catalog_origin", request.headers.get("Origin") || "same-origin");
  return new Request(keyUrl.toString(), { method: "GET" });
}

function catalogCacheResponse(response, cacheState) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=30, s-maxage=300");
  headers.set("X-UVID-Catalog-Cache", cacheState);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url); const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      const catalogCache = globalThis.caches && globalThis.caches.default;
      const catalogKey = publicCatalogCacheKey(request, path, url);
      if (catalogCache && catalogKey) {
        const cached = await catalogCache.match(catalogKey);
        if (cached) return catalogCacheResponse(cached, "HIT");
      }
      if (!env.DB) return error("The D1 database is not connected to this Worker yet.",503);
      if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{"Allow":"GET,POST,PUT,DELETE,OPTIONS"}});
      if (!checkOrigin(request,env) && !["GET","HEAD"].includes(request.method)) return error("Request origin is not allowed.",403);
      if (path.startsWith("/api/images/") || path.startsWith("/uploads/")) {
        const response=await serveImage(request,env,path); if(response) return response;
      }
      const adminApiPath = path.startsWith("/api/admin/") || path.startsWith("/api/auth/admin/");
      const authMePath = path === "/api/auth/me";
      const candidateTokens = adminApiPath
        ? [cookieValue(request,ADMIN_COOKIE),cookieValue(request,LEGACY_COOKIE)]
        : authMePath
          ? [cookieValue(request,ADMIN_COOKIE),cookieValue(request,LEGACY_COOKIE),cookieValue(request,CUSTOMER_COOKIE)]
          : [cookieValue(request,CUSTOMER_COOKIE),cookieValue(request,LEGACY_COOKIE)];
      let user = null;
      for (const candidateToken of candidateTokens) {
        user = await verifySession(env,candidateToken);
        if (user) break;
      }
      if (adminApiPath && user?.role !== "ADMIN") user = null;
      if (!adminApiPath && !authMePath && user?.role !== "CUSTOMER") user = null;
      if (user?.role === "ADMIN" && clean(user.email, 200).toLowerCase() !== clean(env.ADMIN_EMAIL, 200).toLowerCase()) user=null;
      if (path.startsWith("/api/")) {
        if (!env.SESSION_SECRET) return error("Set the SESSION_SECRET Worker secret before using the store API.",503);
        const response = await handleApi(request,env,user,url);
        if (catalogCache && catalogKey && response.status === 200) {
          const cacheResponse = catalogCacheResponse(response, "MISS");
          const cacheWrite = catalogCache.put(catalogKey, cacheResponse.clone());
          if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cacheWrite);
          else await cacheWrite;
          return cacheResponse;
        }
        return response;
      }
      return json({service:"UVID Store API",status:"ready"});
    } catch (e) {
      if (!e?.status) console.error("[UVID Worker]", e?.stack || e);
      return error(e?.status ? e.message : "Something went wrong on the store server.",e?.status || 500);
    }
  }
};
