/* Push notifications are scoped to the store origin and opened in the admin orders view. */
self.addEventListener("push", function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_e) { data = { body: event.data ? event.data.text() : "A UVID order was paid." }; }

  const options = {
    body: String(data.body || "A UVID order was paid."),
    icon: "/assets/logo.jpeg",
    badge: "/assets/logo.jpeg",
    tag: String(data.tag || "uvid-paid-order"),
    data: { url: String(data.url || "/admin/#/orders") },
  };
  event.waitUntil(self.registration.showNotification(String(data.title || "UVID order update"), options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "/admin/#/orders", self.location.origin);
  if (target.origin !== self.location.origin) return;

  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async function (clients) {
    const existing = clients.find(function (client) { return client.url.startsWith(self.location.origin + "/admin/"); });
    if (existing) {
      if (existing.navigate) await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
