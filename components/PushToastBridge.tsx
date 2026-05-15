"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toaster";

// Receives messages from the push service worker and turns them into in-app
// toasts. The service worker (public/push-sw.js) checks if a TravelSTA tab
// is visible on this device; if so, it postMessages the payload here instead
// of showing a system notification.
//
// This means:
//   - You're in the app → toast (no annoying banner duplication)
//   - You're not in the app → push notification banner
//
// Tapping the toast navigates to the same URL the notification would have.

type SwMessage = {
  type?: string;
  payload?: { title?: string; body?: string; url?: string; tag?: string };
};

export default function PushToastBridge() {
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    function onMessage(event: MessageEvent) {
      const data = event.data as SwMessage | undefined;
      if (!data || data.type !== "travelsta-push") return;
      const p = data.payload ?? {};
      const title = p.title ?? "TravelSTA";
      const body = p.body ?? "";
      const url = p.url;

      // Anomalies use ⚠️ / 🌙 prefixes in their titles — route them to the
      // warning style so they stand out from "Mac added an expense" toasts.
      const kind: "info" | "warning" =
        /^[⚠️🌙]|anomaly/i.test(title) ? "warning" : "info";

      toast({
        kind,
        title,
        body: url
          ? `${body} — tap toast to view`
          : body,
      });

      // Wire the click target: clicking anywhere on the toast body navigates.
      // Toaster doesn't expose a click handler on toasts directly, so we
      // attach a one-time delegated click listener that auto-removes after
      // first match. Cheap hack but works without changing the Toaster API.
      if (url) {
        const handler = (e: MouseEvent) => {
          const target = e.target as HTMLElement | null;
          if (!target) return;
          const toastEl = target.closest('[class*="bg-amber-950"], [class*="bg-slate-900"]');
          if (!toastEl) return;
          const text = toastEl.textContent ?? "";
          if (text.includes(title.slice(0, 20))) {
            router.push(url);
            document.removeEventListener("click", handler, true);
          }
        };
        document.addEventListener("click", handler, true);
        // Cleanup after 5s (toast lifetime is 4s) so we don't leak listeners.
        setTimeout(() => document.removeEventListener("click", handler, true), 5000);
      }
    }

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [toast, router]);

  return null;
}
