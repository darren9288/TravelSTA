"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";

// One-button UI to enable / disable web push notifications.
//
// Flow when the user enables:
//   1. Check Notification.permission — if it's "denied" we can't recover
//      from JS (user has to flip the toggle in browser settings).
//   2. Otherwise call Notification.requestPermission() which shows the
//      OS-level prompt.
//   3. Get the service worker registration (already installed by next-pwa).
//   4. Fetch the VAPID public key from our API.
//   5. Call pushManager.subscribe() — browser handles handshake with
//      Google FCM / Apple APNs and returns a subscription object.
//   6. POST that subscription to /api/push/subscribe so the server can
//      later target this device.
//
// Disabling does the reverse: unsubscribe + DELETE on the server.
//
// "Send test" hits /api/push/test which fires a "Hello" notification at
// every device the current user has registered.

// VAPID public keys are URL-safe base64 — convert to the Uint8Array
// pushManager.subscribe() expects.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationToggle() {
  // null = haven't checked yet; otherwise current state
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    // See if we already have a subscription on this device — keeps the toggle
    // accurate across page refreshes.
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    });
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      if (Notification.permission === "denied") {
        setMessage({
          kind: "err",
          text: "Notifications are blocked in your browser settings. Open Site Settings → Notifications → Allow for this site, then try again.",
        });
        return;
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMessage({ kind: "err", text: "Permission not granted." });
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
      const { public_key, error } = await keyRes.json();
      if (!public_key) {
        setMessage({ kind: "err", text: error ?? "Server is not configured for push." });
        return;
      }

      // Cast through ArrayBuffer to satisfy strict TS lib types — runtime
      // value is a Uint8Array which is exactly what pushManager wants.
      const keyArr = urlBase64ToUint8Array(public_key);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyArr.buffer as ArrayBuffer,
      });

      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setMessage({ kind: "err", text: saveData.error ?? "Couldn't save subscription." });
        return;
      }

      setSubscribed(true);
      setMessage({ kind: "ok", text: "Notifications enabled on this device." });
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
          method: "DELETE",
        });
      }
      setSubscribed(false);
      setMessage({ kind: "ok", text: "Notifications disabled on this device." });
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error ?? "Test failed" });
        return;
      }
      setMessage({
        kind: "ok",
        text: `Test sent to ${data.sent} device${data.sent === 1 ? "" : "s"}. Check your notification tray.`,
      });
    } catch (e) {
      setMessage({ kind: "err", text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  if (supported === null) return null;
  if (!supported) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-start gap-3">
        <BellOff size={16} className="text-slate-500 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">Notifications not supported</p>
          <p className="text-xs text-slate-500 mt-1">
            Your browser doesn&apos;t support web push. On iPhone, install this app to your home
            screen first, then open it from there.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {subscribed ? (
          <BellRing size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
        ) : (
          <Bell size={18} className="text-slate-400 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Push notifications</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {subscribed
              ? "You'll get a notification when a friend adds an expense, settles up, or your spending spikes."
              : "Get a banner on your phone or desktop when something happens in your trip — even when this app is closed."}
          </p>
          {permission === "denied" && (
            <p className="text-xs text-amber-400 mt-2">
              Notifications are blocked in browser settings. You&apos;ll need to allow them there before you can enable here.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {subscribed ? (
          <button
            onClick={disable}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs rounded-md transition-colors"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <BellOff size={12} />}
            Disable on this device
          </button>
        ) : (
          <button
            onClick={enable}
            disabled={busy || permission === "denied"}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-md transition-colors"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
            Enable notifications
          </button>
        )}

        {subscribed && (
          <button
            onClick={sendTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs rounded-md transition-colors"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send test
          </button>
        )}
      </div>

      {message && (
        <p
          className={`text-xs ${
            message.kind === "ok" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
