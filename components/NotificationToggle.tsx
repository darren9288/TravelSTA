"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Send, Info, RefreshCw } from "lucide-react";

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

// navigator.serviceWorker.ready can hang forever if no SW is installed
// (most common cause: user opened the URL in Safari instead of from the
// homescreen icon, so the next-pwa SW never registered). Race it against
// a timeout so the spinner doesn't spin forever.
function readyOrTimeout(ms = 8000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, rej) =>
      setTimeout(
        () =>
          rej(
            new Error(
              "Service worker isn't registered on this device. On iPhone: open the app FROM the homescreen icon (not Safari). On Android/desktop: install via Add to Home Screen / Install App."
            )
          ),
        ms
      )
    ),
  ]);
}

export default function NotificationToggle() {
  // null = haven't checked yet; otherwise current state
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Live diagnostic state — surfaces the silent-failure cases (no SW, no PWA install,
  // missing VAPID env vars) so the user knows what to fix instead of staring at a spinner.
  const [diag, setDiag] = useState({
    swReady: false,
    swController: false,
    standalone: false,           // running from homescreen icon, not a browser tab
    vapidLoaded: false,
    existingSub: false,
  });
  const [showDiag, setShowDiag] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    // Standalone = launched from the homescreen icon. iOS Safari only allows
    // push from standalone PWAs.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS legacy flag — still set on iPhone PWA contexts
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setDiag((d) => ({
      ...d,
      standalone,
      swController: Boolean(navigator.serviceWorker.controller),
    }));

    // See if we already have a subscription on this device — keeps the toggle
    // accurate across page refreshes. Race against a timeout so we don't hang.
    readyOrTimeout(4000)
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(Boolean(sub));
        setDiag((d) => ({ ...d, swReady: true, existingSub: Boolean(sub) }));
      })
      .catch(() => {
        setDiag((d) => ({ ...d, swReady: false }));
      });

    // Light VAPID check so the diagnostic panel shows whether the server side is wired.
    fetch("/api/push/vapid-public-key", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setDiag((d) => ({ ...d, vapidLoaded: Boolean(data.public_key) })))
      .catch(() => setDiag((d) => ({ ...d, vapidLoaded: false })));
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

      const reg = await readyOrTimeout(8000);
      setDiag((d) => ({ ...d, swReady: true }));

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
      const reg = await readyOrTimeout(8000);
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

  // Manual recovery for the "SW stuck in waiting" case — forces a fresh
  // registration of /sw.js and waits for it to become active. Useful on
  // iOS where the auto-update is conservative and an old SW can linger
  // across deploys.
  async function reregisterSW() {
    setBusy(true);
    setMessage(null);
    try {
      // Try to unregister any existing registration first so we start clean.
      const existing = await navigator.serviceWorker.getRegistration();
      if (existing) {
        await existing.unregister();
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      // Wait up to 10s for it to activate.
      const start = Date.now();
      while (Date.now() - start < 10_000) {
        if (reg.active) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!reg.active) {
        setMessage({
          kind: "err",
          text: "Tried to register the service worker but it didn't activate in 10s. Try force-quitting the app (swipe up) and reopening.",
        });
        return;
      }
      setDiag((d) => ({ ...d, swReady: true, swController: Boolean(navigator.serviceWorker.controller) }));
      setMessage({ kind: "ok", text: "Service worker is now active. Try Enable Notifications again." });
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

        {/* Recovery: only surfaces when the SW isn't active. Lets the user
            re-register without having to force-quit and reopen the PWA. */}
        {!diag.swReady && (
          <button
            onClick={reregisterSW}
            disabled={busy}
            title="Force the service worker to re-register. Use this if Enable is hanging or the diagnostic shows 'Service worker active: no'."
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/70 hover:bg-amber-500 disabled:opacity-50 text-white text-xs rounded-md transition-colors"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Re-register service worker
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

      {/* Diagnostic panel — surfaces silent failures so the user knows what to fix */}
      <button
        onClick={() => setShowDiag((s) => !s)}
        className="self-start flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
      >
        <Info size={10} /> {showDiag ? "Hide" : "Show"} diagnostic info
      </button>
      {showDiag && (
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-lg p-3 text-[11px] font-mono space-y-1">
          <DiagRow label="Browser supports push" ok={Boolean(supported)} />
          <DiagRow
            label="Running as installed PWA"
            ok={diag.standalone}
            hint={!diag.standalone ? "On iPhone: install via Share → Add to Home Screen, then OPEN from the homescreen icon (not Safari)." : undefined}
          />
          <DiagRow
            label="Service worker active"
            ok={diag.swReady}
            hint={!diag.swReady ? "Service worker isn't registered. This usually means the page is open in Safari instead of the installed PWA. Reload after installing." : undefined}
          />
          <DiagRow
            label="Permission granted"
            ok={permission === "granted"}
            hint={permission === "denied" ? "Blocked in browser settings — must be unblocked there before this app can re-ask." : permission === "default" ? "Not asked yet (will prompt on Enable)." : undefined}
          />
          <DiagRow
            label="Server VAPID key loaded"
            ok={diag.vapidLoaded}
            hint={!diag.vapidLoaded ? "VAPID_PUBLIC_KEY env var isn't set in Vercel, or this deploy hasn't picked it up yet. Add it and redeploy." : undefined}
          />
          <DiagRow label="Existing subscription on this device" ok={diag.existingSub} />
        </div>
      )}
    </div>
  );
}

function DiagRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-400">{label}</span>
        <span className={ok ? "text-emerald-400" : "text-amber-400"}>
          {ok ? "✓ yes" : "✗ no"}
        </span>
      </div>
      {hint && !ok && <p className="text-slate-500 mt-0.5 ml-1 leading-snug">{hint}</p>}
    </div>
  );
}
