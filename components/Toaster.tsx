"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, XCircle, Info, X } from "lucide-react";

type ToastKind = "success" | "info" | "warning" | "error";
type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  createdAt: number;
};

type ToastContextValue = {
  toast: (t: Omit<Toast, "id" | "createdAt">) => void;
};

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

// useToast lets any client component fire a toast.
//   const { toast } = useToast();
//   toast({ kind: "info", title: "Saved!", body: "Your expense was added" });
export function useToast() {
  return useContext(ToastContext);
}

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; iconColor: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  success: { bg: "bg-emerald-950/90", border: "border-emerald-700/60", iconColor: "text-emerald-400", Icon: CheckCircle2 },
  info: { bg: "bg-slate-900/95", border: "border-slate-700/60", iconColor: "text-blue-400", Icon: Info },
  warning: { bg: "bg-amber-950/90", border: "border-amber-700/60", iconColor: "text-amber-400", Icon: AlertCircle },
  error: { bg: "bg-red-950/90", border: "border-red-800/60", iconColor: "text-red-400", Icon: XCircle },
};

// Toaster component to mount once in the layout. Provides context for any
// descendant to fire toasts, and renders the floating stack at top-center.
// Each toast auto-dismisses after ~4 seconds and can be manually closed.
export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, "id" | "createdAt">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => {
      // Dedupe: if the same kind+title was just shown within the last 2s, ignore.
      const recent = prev.find(
        (p) => p.kind === t.kind && p.title === t.title && Date.now() - p.createdAt < 2000
      );
      if (recent) return prev;
      // Cap stack at 4 visible toasts.
      const next = [...prev, { ...t, id, createdAt: Date.now() }];
      return next.slice(-4);
    });
    // Auto-dismiss after 4s.
    setTimeout(() => {
      setToasts((prev) => prev.filter((p) => p.id !== id));
    }, 4_000);
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Top-center placement. `top-12` keeps it clear of the offline banner
          (top-0, ~28px tall) and the navigation progress bar (top-0, 2px).
          On wide screens the toast caps at 28rem so it doesn't stretch
          across the whole viewport. */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[300] flex flex-col gap-2.5 w-[min(92vw,28rem)] pointer-events-none">
        {toasts.map((t) => {
          const s = KIND_STYLES[t.kind];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto ${s.bg} ${s.border} backdrop-blur-sm border rounded-xl px-4 py-3.5 shadow-2xl flex items-start gap-3`}
              style={{ animation: "toast-slide-in-top 220ms ease-out" }}
            >
              <s.Icon size={20} className={`${s.iconColor} mt-0.5 flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-base text-white font-semibold leading-snug">{t.title}</p>
                {t.body && <p className="text-sm text-slate-300 mt-1 leading-relaxed">{t.body}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-slate-400 hover:text-white transition-colors flex-shrink-0 p-0.5 -mr-1 -mt-1"
                aria-label="Dismiss"
              >
                <X size={18} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
