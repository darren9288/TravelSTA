"use client";
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

// Auto-prompt for push notifications on first trip visit.
//
// Decides what to do based on Notification.permission + a localStorage flag:
//
//   permission = "default" (never asked)
//     → Show the modal explaining notifications. One tap fires the system
//       permission request + auto-subscribes. Dismiss = remind in 7 days.
//
//   permission = "granted" + no DB subscription yet
//     → Silently subscribe (background) — no UI shown.
//
//   permission = "granted" + already subscribed
//     → Do nothing. Already covered.
//
//   permission = "denied"
//     → Do nothing. We can't ask again; user must fix in browser settings.
//
// Existing trip members who already opened the app BEFORE this component
// shipped will hit "default" permission next time → see the prompt then.

const DISMISS_KEY = "notification-prompt-dismissed-until";
const DISMISS_DAYS = 7;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationAutoPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!supported) return;

    // Skip if user dismissed the prompt recently.
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return;

    const permission = Notification.permission;

    if (permission === "denied") {
      // Browser blocks repeat requests after a denial. User must re-enable
      // manually via the browser's site-settings page. We don't pester here.
      return;
    }

    if (permission === "default") {
      // Never asked. Show the soft prompt — but only after a small delay
      // so it doesn't slap the user the instant the page mounts.
      const t = setTimeout(() => setShow(true), 1200);
      return () => clearTimeout(t);
    }

    if (permission === "granted") {
      // Permission was already granted (maybe in a previous session).
      // Check if a DB subscription exists; if not, recreate silently.
      void ensureSubscribed().catch((e) => {
        // Don't surface — if the silent re-subscribe fails the user can
        // hit "Send test" on the Account page to recover.
        console.warn("[notification-autoprompt] silent resubscribe failed:", (e as Error).message);
      });
    }
  }, []);

  async function ensureSubscribed() {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((_, rej) =>
        setTimeout(() => rej(new Error("SW not ready")), 10_000)
      ),
    ]);
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Already subscribed locally. Make sure the server knows about it
      // (it might have been pruned during a deploy or a re-install).
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing.toJSON()),
      });
      return;
    }
    const { public_key } = await fetch("/api/push/vapid-public-key").then((r) => r.json());
    if (!public_key) throw new Error("VAPID key missing");
    const keyArr = urlBase64ToUint8Array(public_key);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyArr.buffer as ArrayBuffer,
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      if (result !== "granted") {
        if (result === "denied") {
          // Stop pestering — the user clearly doesn't want this.
          localStorage.setItem(DISMISS_KEY, String(Date.now() + 365 * 24 * 60 * 60 * 1000));
          setShow(false);
        }
        return;
      }
      await ensureSubscribed();
      setShow(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
    );
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center px-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        style={{ marginBottom: "calc(env(safe-area-inset-bottom, 0) + 1rem)" }}
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <Bell size={22} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white">Stay in the loop</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Get notified when someone adds an expense, runs Settle All, or if the app spots a possible duplicate or pool overdraft.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="p-1 text-slate-500 hover:text-white -mt-1 -mr-1"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={enable}
          disabled={busy}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {busy ? "Enabling…" : "Enable notifications"}
        </button>

        <p className="text-[11px] text-slate-500 text-center">
          We never send spam — only events from your own trips. You can change this anytime in Account.
        </p>
      </div>
    </div>
  );
}
