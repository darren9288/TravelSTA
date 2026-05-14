// Push notification handlers, imported by the next-pwa generated service
// worker via the `importScripts` option in next.config.js. Adding it as a
// separate file means we don't have to fight next-pwa for control of sw.js.
//
// Two events:
//   1. `push` — fired when the server delivers a push payload. We unwrap
//      the JSON and call showNotification() so the OS displays a banner
//      even if the app is closed.
//   2. `notificationclick` — fired when the user taps the notification.
//      We focus an existing TravelSTA tab if one exists, or open a new
//      one at the URL the payload specified.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Some browsers send empty pushes for warm-up — show a generic banner
    // so the OS doesn't penalize us for a silent push.
    data = { title: "TravelSTA", body: "You have a new update." };
  }
  const title = data.title || "TravelSTA";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.svg",
    badge: data.badge || "/icons/icon-192.svg",
    tag: data.tag || "travelsta",     // dedupes — same tag replaces instead of stacking
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // If an existing TravelSTA window is open, focus it and navigate.
        for (const c of clients) {
          if ("focus" in c) {
            c.focus();
            if ("navigate" in c) {
              return c.navigate(targetUrl);
            }
            return;
          }
        }
        // Otherwise spawn a new window/tab.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
