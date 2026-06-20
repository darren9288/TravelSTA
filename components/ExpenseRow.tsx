"use client";
import { Expense, Traveler, ExpenseSplit } from "@/lib/supabase";
import TravelerBadge from "./TravelerBadge";
import { Trash2, Pencil, ChevronDown, ChevronUp, Lock, Camera, X, Image, Coins } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const CAT_COLORS: Record<string, string> = {
  "Breakfast": "#f97316", "Lunch": "#f97316", "Dinner": "#f97316", "Small Eat": "#f97316",
  "Hotel": "#6366f1", "Flight": "#3b82f6", "Transport": "#3b82f6", "Car Rental": "#3b82f6", "Fuel": "#3b82f6",
  "Activity": "#ec4899", "Entertainment": "#ec4899",
  "Souvenirs": "#a855f7", "Shopping": "#a855f7", "Supplies": "#a855f7",
  "Laundry": "#14b8a6", "Travel Related": "#14b8a6",
  "Top Up": "#22c55e", "Transfer In": "#22c55e", "Transfer Out": "#22c55e",
  "Others": "#94a3b8",
};

type WalletOption = { id: string; name: string; currency: string; traveler_id: string };

type Props = {
  expense: Expense;
  travelers: Traveler[];
  foreignCurrency: string;
  wallets?: WalletOption[];
  onDelete?: (id: string) => void;
  onEdit?: (expense: Expense) => void;
};

function isAutoSettled(split: ExpenseSplit, expense: Expense, travelers: Traveler[]): boolean {
  if (split.locked) return true;
  const payer = travelers.find((t) => t.id === expense.paid_by_id);
  if (payer?.is_pool) return true;
  if (split.traveler_id === expense.paid_by_id) return true;
  if (expense.split_type === "individual" && Number(split.amount) === 0) return true;
  return false;
}

export default function ExpenseRow({ expense, travelers, foreignCurrency, wallets = [], onDelete, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [splits, setSplits] = useState<ExpenseSplit[]>(expense.splits ?? []);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState("");
  const autoSavedIds = useRef<Set<string>>(new Set());
  const [photoUrl, setPhotoUrl] = useState<string | null>(expense.photo_url ?? null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Ryt cashback indicator. Mirrors the Analytics CashbackReport: an expense
  // counts toward cashback when its wallet name (or payment type) contains "ryt".
  // The % is the per-trip rate the user set on the Analytics card (localStorage),
  // defaulting to 1.2%. Display-only — never changes the split or settlement.
  const [cashbackRate, setCashbackRate] = useState(1.2);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(`cashback_rate_${expense.trip_id}`);
    if (saved && !isNaN(parseFloat(saved))) setCashbackRate(parseFloat(saved));
  }, [expense.trip_id]);
  const rytWallet = expense.wallet_id ? wallets.find((w) => w.id === expense.wallet_id) : undefined;
  const isRyt =
    (rytWallet?.name ?? "").toLowerCase().includes("ryt") ||
    (expense.payment_type ?? "").toLowerCase().includes("ryt");
  const cashback = isRyt ? Number(expense.myr_amount) * (cashbackRate / 100) : 0;

  // Wallet picker shown when settling a split that involves wallets
  const [settlingPick, setSettlingPick] = useState<{ split: ExpenseSplit; fromWalletId: string; toWalletId: string } | null>(null);

  useEffect(() => {
    if (!toggling) setSplits(expense.splits ?? []);
  }, [expense.splits]);

  // Auto-settle payer/pool/RM0 splits in DB if wrongly unsettled
  useEffect(() => {
    const toFix = (expense.splits ?? []).filter(
      (s) => isAutoSettled(s, expense, travelers) && !s.is_settled && !autoSavedIds.current.has(s.id)
    );
    if (toFix.length === 0) return;
    toFix.forEach((s) => {
      autoSavedIds.current.add(s.id);
      fetch("/api/splits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, is_settled: true }),
      });
    });
    setSplits((prev) =>
      prev.map((s) => toFix.some((f) => f.id === s.id) ? { ...s, is_settled: true } : s)
    );
  }, [expense.splits]);

  const color = CAT_COLORS[expense.category] ?? "#94a3b8";
  const paidBy = expense.paid_by ?? travelers.find((t) => t.id === expense.paid_by_id);
  const paidByPool = travelers.find((t) => t.id === expense.paid_by_id)?.is_pool ?? false;

  const hasUnsettled = splits.some((s) => !s.is_settled && !isAutoSettled(s, expense, travelers));
  const displayNotes = expense.notes && expense.notes.trim().toLowerCase() !== expense.category.trim().toLowerCase()
    ? expense.notes : null;
  const splitsTotal = splits.reduce((s, x) => s + Number(x.amount), 0);
  const splitsMismatch = splits.length > 0 && Math.abs(splitsTotal - Number(expense.myr_amount)) > 0.05;
  // Any split a user could long-press to lock (settled, not auto/locked) or
  // unlock (manually locked)? Drives the "long-press to lock" hint.
  const hasLockableSplit = splits.some(
    (s) => (s.is_settled && !s.locked && !autoByRule(s)) || (!!s.locked && s.lock_source === "manual")
  );

  async function doSettle(split: ExpenseSplit, fromWalletId?: string, toWalletId?: string) {
    setSettlingPick(null);
    setToggling(split.id);
    setToggleError("");
    const newVal = !split.is_settled;
    setSplits((prev) => prev.map((s) => s.id === split.id ? { ...s, is_settled: newVal } : s));
    try {
      const res = await fetch("/api/splits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: split.id, is_settled: newVal, from_wallet_id: fromWalletId ?? null, to_wallet_id: toWalletId ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSplits((prev) => prev.map((s) => s.id === split.id ? { ...s, is_settled: split.is_settled } : s));
        setToggleError(data.error ?? `Save failed (${res.status})`);
      }
    } catch {
      setSplits((prev) => prev.map((s) => s.id === split.id ? { ...s, is_settled: split.is_settled } : s));
      setToggleError("Network error — could not save");
    }
    setToggling(null);
  }

  function toggleSettle(split: ExpenseSplit) {
    if (isAutoSettled(split, expense, travelers)) return;
    if (split.is_settled) { doSettle(split); return; }
    const settlerWallets = wallets.filter((w) => w.traveler_id === split.traveler_id);
    const payerWallets = wallets.filter((w) => w.traveler_id === expense.paid_by_id);
    if (settlerWallets.length > 0 || payerWallets.length > 0) {
      setSettlingPick({ split, fromWalletId: settlerWallets[0]?.id ?? "", toWalletId: payerWallets[0]?.id ?? "" });
    } else {
      doSettle(split);
    }
  }

  // ── Long-press to lock / unlock a settled split ──────────────────────────
  // Long-press (≈500 ms) the ✓ to manually LOCK a settled split so it can't be
  // toggled by accident. Long-press a manually-locked split to UNLOCK it.
  // Settle-All locks (lock_source !== "manual") are never unlockable here.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  // Is THIS split a per-rule auto-settle (pool/payer/RM0), ignoring the
  // `locked` column? Used to decide whether manual-lock makes sense.
  function autoByRule(split: ExpenseSplit): boolean {
    const payer = travelers.find((t) => t.id === expense.paid_by_id);
    if (payer?.is_pool) return true;
    if (split.traveler_id === expense.paid_by_id) return true;
    if (expense.split_type === "individual" && Number(split.amount) === 0) return true;
    return false;
  }

  async function doLockToggle(split: ExpenseSplit, lock: boolean) {
    setToggling(split.id);
    setToggleError("");
    // Optimistic update.
    setSplits((prev) => prev.map((s) => s.id === split.id
      ? { ...s, locked: lock, lock_source: lock ? "manual" : null }
      : s));
    try {
      const res = await fetch("/api/splits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: split.id, lock }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSplits((prev) => prev.map((s) => s.id === split.id
          ? { ...s, locked: split.locked, lock_source: split.lock_source }
          : s));
        setToggleError(data.error ?? `Save failed (${res.status})`);
      }
    } catch {
      setSplits((prev) => prev.map((s) => s.id === split.id
        ? { ...s, locked: split.locked, lock_source: split.lock_source }
        : s));
      setToggleError("Network error — could not save");
    }
    setToggling(null);
  }

  function handleLongPress(split: ExpenseSplit) {
    const name = travelers.find((t) => t.id === split.traveler_id)?.name ?? "this";
    const manualLocked = !!split.locked && split.lock_source === "manual";
    const settleAllLocked = !!split.locked && split.lock_source !== "manual";
    if (settleAllLocked) return; // managed from the Settlement page only
    if (manualLocked) {
      if (window.confirm(`Unlock ${name}'s settlement?\n\nYou'll be able to tick / untick it again.`)) {
        doLockToggle(split, false);
      }
      return;
    }
    // Not locked — only lockable if it's a real settled split (not auto-settled).
    if (split.is_settled && !autoByRule(split)) {
      if (window.confirm(`Lock ${name}'s settlement?\n\nIt can't be changed until you unlock it (long-press again).`)) {
        doLockToggle(split, true);
      }
    }
  }

  function startPress(split: ExpenseSplit) {
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      handleLongPress(split);
    }, 500);
  }
  function cancelPress() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${hasUnsettled ? "bg-amber-950/20 border-amber-800/40" : "bg-slate-800/60 border-slate-700/50"}`}>
      <div className="flex items-center gap-3 px-3 py-3 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: hasUnsettled ? "#f59e0b" : color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{expense.category}</span>
            {displayNotes && <span className="text-xs text-slate-500 truncate hidden sm:block">{displayNotes}</span>}
            {splitsMismatch && <span className="text-xs text-red-400 flex-shrink-0">⚠ split</span>}
            {paidByPool && <span className="text-xs text-blue-400 flex-shrink-0">pool</span>}
            {hasUnsettled && <span className="text-xs text-amber-500 flex-shrink-0">unsettled</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {paidBy && <TravelerBadge traveler={paidBy} />}
            <span className="text-xs text-slate-500">{expense.payment_type}</span>
            {isRyt && (
              <span
                className="text-xs text-emerald-400 flex-shrink-0 flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded-full"
                title={`Counts toward Ryt cashback (${cashbackRate}%) — RM ${cashback.toFixed(2)} back to ${paidBy?.name ?? "payer"}`}
              >
                <Coins size={10} /> RM {cashback.toFixed(2)}
              </span>
            )}
            {expense.split_type === "even" && <span className="text-xs text-slate-600">Even split</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-white">RM {Number(expense.myr_amount).toFixed(2)}</p>
          {expense.foreign_amount && (
            <p className="text-xs text-slate-500">{foreignCurrency} {Number(expense.foreign_amount).toLocaleString()}</p>
          )}
          {photoUrl && <Camera size={10} className="text-slate-500 ml-auto mt-0.5" />}
        </div>
        <div className="flex items-center gap-1 ml-1">
          {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-3 bg-slate-900/30">
          {toggleError && <p className="text-xs text-red-400 mb-2">⚠ {toggleError}</p>}

          {/* Wallet picker */}
          {settlingPick && (() => {
            const settlerWallets = wallets.filter((w) => w.traveler_id === settlingPick.split.traveler_id);
            const payerWallets = wallets.filter((w) => w.traveler_id === expense.paid_by_id);
            const settlerName = travelers.find((t) => t.id === settlingPick.split.traveler_id)?.name ?? "Settler";
            const payerName = travelers.find((t) => t.id === expense.paid_by_id)?.name ?? "Payer";
            return (
              <div className="mb-3 bg-slate-800 border border-slate-600 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-xs text-slate-400 font-medium">Settle via wallet transfer?</p>
                <div className="grid grid-cols-2 gap-2">
                  {settlerWallets.length > 0 && (
                    <div><label className="text-xs text-slate-500 mb-1 block">{settlerName} pays from</label>
                      <select value={settlingPick.fromWalletId}
                        onChange={(e) => setSettlingPick((p) => p ? { ...p, fromWalletId: e.target.value } : p)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        <option value="">— no wallet —</option>
                        {settlerWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                      </select></div>
                  )}
                  {payerWallets.length > 0 && (
                    <div><label className="text-xs text-slate-500 mb-1 block">{payerName} receives into</label>
                      <select value={settlingPick.toWalletId}
                        onChange={(e) => setSettlingPick((p) => p ? { ...p, toWalletId: e.target.value } : p)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        <option value="">— no wallet —</option>
                        {payerWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                      </select></div>
                  )}
                </div>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => doSettle(settlingPick.split, settlingPick.fromWalletId || undefined, settlingPick.toWalletId || undefined)}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors">
                    Settle with wallets
                  </button>
                  <button onClick={() => doSettle(settlingPick.split)}
                    className="flex-1 py-1.5 border border-slate-600 text-slate-400 hover:text-white text-xs rounded-lg transition-colors">
                    Settle without wallets
                  </button>
                  <button onClick={() => setSettlingPick(null)}
                    className="px-2 py-1.5 text-slate-600 hover:text-slate-400 text-xs rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}

          {displayNotes && <p className="text-xs text-slate-400 mb-2">📝 {displayNotes}</p>}
          {splitsMismatch && (
            <p className="text-xs text-red-400 mb-2">
              ⚠ Splits total RM {splitsTotal.toFixed(2)} ≠ expense total RM {Number(expense.myr_amount).toFixed(2)} — use Edit to fix
            </p>
          )}

          {hasLockableSplit && (
            <p className="text-[10px] text-slate-600 mb-1.5 flex items-center gap-1">
              <Lock size={9} className="text-slate-600" /> Long-press a ✓ to lock / unlock it
            </p>
          )}
          <div className="flex flex-col gap-1.5 mb-3">
            {splits.map((s) => {
              const t = travelers.find((x) => x.id === s.traveler_id);
              if (!t) return null;
              const locked = isAutoSettled(s, expense, travelers);
              const manualLocked = !!s.locked && s.lock_source === "manual";
              const settleAllLocked = !!s.locked && s.lock_source !== "manual";
              const autoRule = autoByRule(s);
              // Hard-locked = can't interact at all (Settle-All lock or auto-settle rule).
              // Manual locks stay interactive so a long-press can unlock them.
              const hardLocked = settleAllLocked || autoRule;
              const lockReason = manualLocked ? "locked" : s.locked ? "settled" : paidByPool ? "pool" : s.traveler_id === expense.paid_by_id ? "payer" : "RM 0";
              const lockTitle = settleAllLocked
                ? "Locked by Settle All — manage from the Settlement page"
                : manualLocked
                  ? "Locked — long-press to unlock"
                  : autoRule
                    ? `Auto-settled (${lockReason})`
                    : s.is_settled
                      ? "Long-press to lock"
                      : undefined;

              return (
                <div key={s.id} className="flex items-start gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // A completed long-press already handled this press.
                      if (longPressFired.current) { longPressFired.current = false; return; }
                      // Manual-locked: short tap does nothing (long-press unlocks).
                      if (manualLocked) return;
                      toggleSettle(s);
                    }}
                    onPointerDown={(e) => { e.stopPropagation(); if (!hardLocked) startPress(s); }}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={hardLocked || toggling === s.id}
                    title={lockTitle}
                    style={{ touchAction: "manipulation", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
                    className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      hardLocked
                        ? "bg-slate-600 border-slate-600 cursor-not-allowed"
                        : manualLocked
                          ? "bg-slate-500 border-slate-400 cursor-pointer"
                          : s.is_settled
                            ? "bg-emerald-500 border-emerald-500 cursor-pointer"
                            : "border-slate-500 hover:border-amber-400 cursor-pointer"
                    } ${toggling === s.id ? "opacity-50" : ""}`}
                  >
                    {(s.is_settled || locked) && (
                      locked
                        ? <Lock size={8} className="text-slate-300" />
                        : <span className="text-white text-xs leading-none">✓</span>
                    )}
                  </button>
                  <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${(s.is_settled || locked) ? "text-slate-500 line-through" : "text-slate-300"}`}>
                      {t.name}
                    </span>
                    {s.is_settled && !locked && (() => {
                      const fromW = wallets.find((w) => w.id === s.from_wallet_id);
                      const toW = wallets.find((w) => w.id === s.to_wallet_id);
                      if (fromW || toW) return (
                        <p className="text-xs text-slate-500 mt-0.5">
                          💳 <span className="text-slate-400">{fromW?.name ?? "?"}</span>
                          <span className="text-slate-600"> → </span>
                          <span className="text-slate-400">{toW?.name ?? "?"}</span>
                        </p>
                      );
                      return null;
                    })()}
                    {locked && <p className="text-xs text-slate-600 italic mt-0.5">{lockReason}</p>}
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ${(s.is_settled || locked) ? "text-slate-500" : "text-white"}`}>
                    RM {Number(s.amount).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Photo receipt */}
          <div className="mb-3">
            {photoUrl ? (
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
                  className="flex-shrink-0">
                  <img src={photoUrl} alt="Receipt" className="w-14 h-14 object-cover rounded-lg border border-slate-700 hover:opacity-80 transition-opacity" />
                </button>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Image size={11} /> Receipt attached</span>
                  {onEdit && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm("Remove receipt photo?")) return;
                        await fetch(`/api/expenses/upload-photo?expense_id=${expense.id}`, { method: "DELETE" });
                        setPhotoUrl(null);
                      }}
                      className="text-xs text-slate-600 hover:text-red-400 transition-colors flex items-center gap-1"
                    >
                      <X size={10} /> Remove
                    </button>
                  )}
                </div>
              </div>
            ) : onEdit ? (
              <button
                onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click(); }}
                disabled={photoUploading}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
              >
                <Camera size={12} /> {photoUploading ? "Uploading…" : "Add receipt photo"}
              </button>
            ) : null}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                // Cap receipt photos at 2 MB to stay safely under both the
                // Free-tier cached-egress quota and Next.js's 4.5 MB API body
                // limit. Most phone photos are 1-3 MB JPEGs — a quick "shrink
                // image" step in their gallery usually does the job.
                const MAX_BYTES = 2 * 1024 * 1024;
                if (file.size > MAX_BYTES) {
                  const sizeMb = (file.size / 1024 / 1024).toFixed(1);
                  alert(`Receipt is ${sizeMb} MB — max 2 MB. Compress at tinypng.com or shrink in your phone's photo app, then try again.`);
                  e.target.value = "";
                  return;
                }
                setPhotoUploading(true);
                const form = new FormData();
                form.append("file", file);
                form.append("expense_id", expense.id);
                const res = await fetch("/api/expenses/upload-photo", { method: "POST", body: form });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                  setPhotoUrl(data.photo_url);
                } else {
                  alert(data.error ?? `Upload failed (${res.status})`);
                }
                setPhotoUploading(false);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex gap-3">
            {onEdit && (
              <button onClick={(e) => { e.stopPropagation(); onEdit(expense); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-400 transition-colors">
                <Pencil size={12} /> Edit
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(expense.id); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors">
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && photoUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white" onClick={() => setLightboxOpen(false)}>
            <X size={24} />
          </button>
          <img
            src={photoUrl}
            alt="Receipt full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
