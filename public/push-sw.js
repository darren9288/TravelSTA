// Push notification handlers, imported by the next-pwa generated service
// worker via the `importScripts` option in next.config.js. Adding it as a
// separate file means we don't have to fight next-pwa for control of sw.js.
//
// Routing logic (the important bit):
//   - If a TravelSTA window/tab is open AND focused on this device → we
//     forward the push payload to the page via postMessage so it can show
//     an in-app toast. The system notification is suppressed (would be
//     annoying to get a banner for something already on screen).
//   - If no focused tab → we show the system notification as usual so the
//     user sees it on their lockscreen / home screen / other apps.
//
// This is per-device. If you have the app open on your laptop but closed
// on your phone, the laptop shows a toast and the phone shows a banner.
// Both get the message, each picks the right channel.

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
  const body = data.body || "";
  const url = data.url || "/";
  const tag = data.tag || "travelsta";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((allClients) => {
        // Prefer a truly focused client (user actively looking at the app).
        // Fall back to any visible client (app foregrounded but not focused,
        // e.g. iOS PWA in standalone mode where focus state is murky).
        const focused = allClients.find((c) => c.focused);
        const visible =
          focused ||
          allClients.find((c) => c.visibilityState === "visible");

        if (visible) {
          // App is open on this device — forward to the page as a toast
          // instead of showing a system notification banner.
          visible.postMessage({
            type: "travelsta-push",
            payload: { title, body, url, tag },
          });
          return; // No system notification.
        }

        // App not visible on this device — show system notification as usual.
        return self.registration.showNotification(title, {
          body,
          icon: data.icon || "/icons/icon-192.svg",
          badge: data.badge || "/icons/icon-192.svg",
          tag,
          data: { url },
          vibrate: [80, 40, 80],
          requireInteraction: false,
        });
      })
  );
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
