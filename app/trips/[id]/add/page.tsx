"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, CATEGORIES, PAYMENT_TYPES } from "@/lib/supabase";
import { Sparkles, ClipboardList, Camera, Loader2, X, Users, Coins, Calculator } from "lucide-react";
import { compressImage, blobToBase64 } from "@/lib/image-compress";
import { useTripRealtime } from "@/lib/use-realtime";
import { enqueue } from "@/lib/offline-queue";
import { useToast } from "@/components/Toaster";

type SplitEntry = { traveler_id: string; amount: string; foreignAmount: string };
type ParsedEntry = { description: string; category: string; foreign_amount?: number; myr_amount?: number };

export default function AddExpensePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"form" | "ai" | "receipt" | "separate">("form");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  // Optional time of day, pre-filled with the device's current time ("live time").
  // Sent to the server; if cleared, the server stamps the live time instead.
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [category, setCategory] = useState("Lunch");
  // Optional manual cashback for this expense, credited to the payer. Recorded in
  // a separate ledger — never affects the split or settlement.
  const [cashback, setCashback] = useState("");
  const [splitType, setSplitType] = useState<"even" | "individual">("even");
  const [paidById, setPaidById] = useState("");
  const [paymentType, setPaymentType] = useState("Cash");
  const [currency, setCurrency] = useState("MYR");
  const [foreignAmount, setForeignAmount] = useState("");
  const [myrAmount, setMyrAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<SplitEntry[]>([]);
  const [walletId, setWalletId] = useState<string>("");
  const [walletOptions, setWalletOptions] = useState<{ id: string; name: string; currency: string; traveler_id: string }[]>([]);
  // Tracks whether the user has manually picked a category. If true, we stop
  // auto-categorizing on note edits to avoid stomping their choice.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categorySuggesting, setCategorySuggesting] = useState(false);

  // AI tab — now matches the Form tab's field set so entries created via AI
  // have the same shape (date, wallet, currency, etc.) as ones typed manually.
  const [aiText, setAiText] = useState("");
  const [aiParsed, setAiParsed] = useState<ParsedEntry[] | null>(null);
  const [aiDate, setAiDate] = useState(new Date().toISOString().slice(0, 10));
  const [aiPaidBy, setAiPaidBy] = useState("");
  const [aiWalletId, setAiWalletId] = useState<string>("");
  const [aiPayType, setAiPayType] = useState("Cash");
  const [aiCurrency, setAiCurrency] = useState("MYR");
  const [aiSplitType, setAiSplitType] = useState<"even" | "individual">("even");
  const [aiSplits, setAiSplits] = useState<SplitEntry[]>([]); // per-traveler share of TOTAL
  const [aiParsing, setAiParsing] = useState(false);
  // Tracks whether the user has manually touched aiDate. If so, we won't
  // overwrite it with Claude's parsed date on the next Parse click.
  const [aiDateTouched, setAiDateTouched] = useState(false);

  // ── Separate bills tab ───────────────────────────────────────────────────
  // One restaurant/place where everyone paid for their own meal. Records N
  // expenses in one save — each paid by that person and split only to themselves
  // (so settlement nets to zero; it's pure per-person record-keeping).
  const [sepDate, setSepDate] = useState(new Date().toISOString().slice(0, 10));
  const [sepTime, setSepTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [sepCategory, setSepCategory] = useState("Lunch");
  const [sepNotes, setSepNotes] = useState("");
  const [sepRows, setSepRows] = useState<
    { traveler_id: string; enabled: boolean; currency: string; amount: string; walletId: string; cashback: string }[]
  >([]);

  // ── Receipt OCR tab ──────────────────────────────────────────────────────
  // Snap a photo → compress → send to Claude Vision → preview parsed fields
  // → "Use these values" pre-fills the Form tab and switches over.
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptParsing, setReceiptParsing] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptResult, setReceiptResult] = useState<{
    amount: number | null;
    currency: string | null;
    date: string | null;
    items: string[];
    suggested_category: string;
    confidence: "high" | "medium" | "low";
    raw_text: string;
  } | null>(null);
  const [receiptCompressedKB, setReceiptCompressedKB] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [tripRes, travelerRes, walletRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
        fetch(`/api/wallets?trip_id=${id}`).then((r) => r.json()),
      ]);
      const tripData: Trip | null = tripRes.error ? null : tripRes;
      setTrip(tripData);
      if (tripData?.my_role === "viewer") { router.replace(`/trips/${id}`); return; }
      const all = (Array.isArray(travelerRes) ? travelerRes : []) as Traveler[];
      setTravelers(all);
      const me = tripRes.my_traveler_id ?? null;
      setMyId(me);
      // Default payer: prefer the current user, else the first active traveler.
      const active = all.filter((t) => !t.archived);
      const defaultPayer = me ?? (active[0]?.id ?? "");
      setPaidById(defaultPayer);
      setAiPaidBy(defaultPayer);
      const real = all.filter((t) => !t.is_pool && !t.archived);
      setSplits(real.map((t) => ({ traveler_id: t.id, amount: "", foreignAmount: "" })));
      setAiSplits(real.map((t) => ({ traveler_id: t.id, amount: "", foreignAmount: "" })));
      setSepRows(real.map((t) => ({ traveler_id: t.id, enabled: true, currency: "MYR", amount: "", walletId: "", cashback: "" })));
      setWalletOptions(walletRes.wallets ?? []);
    }
    load();
  }, [id]);

  // If we were navigated to with #ai=<encoded text> (from the voice input
  // flow in the AI Assistant), pre-fill the AI tab and switch to it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const match = hash.match(/^#ai=(.+)/);
    if (match) {
      try {
        const text = decodeURIComponent(match[1]);
        setAiText(text);
        setTab("ai");
        // Clear the hash so a manual reload doesn't keep re-importing it.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        // ignore malformed hash
      }
    }
  }, []);

  // Refresh only the traveler + wallet dropdowns when someone else makes
  // changes mid-form. We deliberately keep the current paid_by/splits state
  // so the user doesn't lose what they were typing — new travelers just
  // appear in the dropdown for them to optionally pick.
  const refreshLists = useCallback(async () => {
    const [travelerRes, walletRes] = await Promise.all([
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/wallets?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    const all = (Array.isArray(travelerRes) ? travelerRes : []) as Traveler[];
    setTravelers(all);
    setWalletOptions(walletRes.wallets ?? []);
    const real = all.filter((t) => !t.is_pool && !t.archived);
    // Add new travelers to splits without erasing existing inputs
    setSplits((prev) => {
      const existing = new Map(prev.map((s) => [s.traveler_id, s]));
      return real.map((t) => existing.get(t.id) ?? { traveler_id: t.id, amount: "", foreignAmount: "" });
    });
    setAiSplits((prev) => {
      const existing = new Map(prev.map((s) => [s.traveler_id, s]));
      return real.map((t) => existing.get(t.id) ?? { traveler_id: t.id, amount: "", foreignAmount: "" });
    });
    setSepRows((prev) => {
      const existing = new Map(prev.map((r) => [r.traveler_id, r]));
      return real.map((t) => existing.get(t.id) ?? { traveler_id: t.id, enabled: true, currency: "MYR", amount: "", walletId: "", cashback: "" });
    });
  }, [id]);

  useTripRealtime(id, refreshLists);

  // Auto-convert foreign → MYR for form tab
  useEffect(() => {
    if (!trip || !foreignAmount || currency === "MYR") return;
    let rate = 1;
    if (currency === trip.foreign_currency) {
      rate = paymentType === "Wise" ? trip.wise_rate : trip.cash_rate;
    } else if (currency === trip.foreign_currency_2) {
      rate = paymentType === "Wise" ? (trip.wise_rate_2 ?? 1) : (trip.cash_rate_2 ?? 1);
    }
    const myr = parseFloat(foreignAmount) / rate;
    if (!isNaN(myr)) setMyrAmount(myr.toFixed(2));
  }, [foreignAmount, paymentType, trip, currency]);

  // Auto-suggest a category from the notes after the user stops typing.
  // Only runs if they haven't manually chosen a category yet.
  useEffect(() => {
    if (categoryTouched) return;
    const trimmed = notes.trim();
    if (trimmed.length < 4) return;
    const handle = setTimeout(async () => {
      setCategorySuggesting(true);
      try {
        const res = await fetch("/api/ai/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: trimmed }),
        });
        const data = await res.json();
        if (res.ok && data.category && CATEGORIES.includes(data.category)) {
          setCategory(data.category);
        }
      } catch {
        // Silent — category auto-suggest is a nicety, not critical.
      } finally {
        setCategorySuggesting(false);
      }
    }, 800);
    return () => clearTimeout(handle);
  }, [notes, categoryTouched]);

  // Only active (non-archived) non-pool travelers are eligible for new even-splits.
  const realTravelers = travelers.filter((t) => !t.is_pool && !t.archived);
  // Selectable in "Paid by" dropdowns — exclude archived but allow pools.
  const activeTravelers = travelers.filter((t) => !t.archived);

  function evenSplitAmount(total: number) {
    return realTravelers.length > 0 ? total / realTravelers.length : 0;
  }

  async function handleSave() {
    if (!myrAmount || !paidById) { setError("Fill in amount and who paid."); return; }
    if (splitType === "individual") {
      const total = parseFloat(myrAmount);
      const splitsSum = splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
      if (Math.abs(splitsSum - total) > 0.05) {
        setError(`Individual splits (RM ${splitsSum.toFixed(2)}) must equal total (RM ${total.toFixed(2)})`);
        return;
      }
    }
    setSaving(true); setError("");

    const total = parseFloat(myrAmount);
    const splitData = splitType === "even"
      ? realTravelers.map((t) => ({ traveler_id: t.id, amount: parseFloat(evenSplitAmount(total).toFixed(2)) }))
      : splits.map((s) => ({ traveler_id: s.traveler_id, amount: parseFloat(s.amount) || 0 }));

    const body = {
      trip_id: id, date, time: time || null, category, split_type: splitType,
      paid_by_id: paidById, payment_type: paymentType,
      currency: currency,
      foreign_amount: currency !== "MYR" ? parseFloat(foreignAmount) || null : null,
      myr_amount: total, notes: notes || null, created_by_id: myId, splits: splitData,
      wallet_id: walletId || null,
    };

    // If we're offline, enqueue the operation instead of failing. The
    // OfflineQueueWatcher in the layout will drain it when the browser
    // reports `online`. We optimistically navigate to the expenses list
    // so the user feels like the save succeeded.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueue({
        method: "POST",
        url: "/api/expenses",
        body,
        description: `${category} · RM ${total.toFixed(2)}`,
      });
      toast({
        kind: "info",
        title: "Saved offline",
        body: "Will sync automatically when you reconnect.",
      });
      router.push(`/trips/${id}/expenses`);
      return;
    }

    // ONLINE: await the save so we KNOW it succeeded before navigating. Reliable —
    // no silent failures. (Perceived speed comes from co-locating the backend in
    // Phase 2, which makes this round-trip fast, not from navigating early.)
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Record manual cashback (if any) against the new expense, credited to the
      // payer. Best-effort — a cashback failure shouldn't block the expense save.
      const cb = parseFloat(cashback);
      if (cb && cb > 0 && data?.id) {
        await fetch("/api/cashback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trip_id: id, expense_id: data.id, traveler_id: paidById, amount: cb }),
        }).catch(() => {});
      }
      router.push(`/trips/${id}/expenses`);
    } catch (e) {
      // Network error while we *thought* we were online — queue rather than lose input.
      const msg = (e as Error).message;
      if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("network")) {
        enqueue({ method: "POST", url: "/api/expenses", body, description: `${category} · RM ${total.toFixed(2)}` });
        toast({ kind: "info", title: "Saved offline", body: "Network glitch — we'll sync when it's back." });
        router.push(`/trips/${id}/expenses`);
        return;
      }
      setError(msg);
      setSaving(false);
    }
  }

  // Map a wallet name to a payment type — same heuristic the Form/AI tabs use.
  function payTypeFromName(name: string): string {
    const n = name.toLowerCase();
    if (n.includes("wise")) return "Wise";
    if (n.includes("credit")) return "Credit Card";
    if (n.includes("debit") || n.includes("card")) return "Debit Card";
    if (n.includes("tng") || n.includes("touch")) return "TNG";
    return "Cash";
  }

  // ── Separate bills helpers ───────────────────────────────────────────────
  function sepRowRate(row: { currency: string; walletId: string }): number {
    if (!trip || row.currency === "MYR") return 1;
    const w = walletOptions.find((x) => x.id === row.walletId);
    const useWise = w ? w.name.toLowerCase().includes("wise") : false;
    if (row.currency === trip.foreign_currency) return useWise ? trip.wise_rate : trip.cash_rate;
    if (row.currency === trip.foreign_currency_2) return useWise ? (trip.wise_rate_2 ?? 1) : (trip.cash_rate_2 ?? 1);
    return 1;
  }
  function sepRowMyr(row: { currency: string; amount: string; walletId: string }): number {
    const amt = parseFloat(row.amount);
    if (!amt || isNaN(amt)) return 0;
    return row.currency === "MYR" ? amt : amt / sepRowRate(row);
  }

  async function handleSepSave() {
    const active = sepRows.filter((r) => r.enabled && parseFloat(r.amount) > 0);
    if (!active.length) { setError("Enter an amount for at least one person."); return; }
    if (!sepCategory) { setError("Pick a category."); return; }
    setSaving(true); setError("");
    try {
      // Fire all rows CONCURRENTLY (was serial — 4 people = 4 sequential waits).
      await Promise.all(active.map(async (row) => {
        const myr = parseFloat(sepRowMyr(row).toFixed(2));
        const w = walletOptions.find((x) => x.id === row.walletId);
        const res = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: id,
            date: sepDate,
            time: sepTime || null,
            category: sepCategory,
            split_type: "individual",
            paid_by_id: row.traveler_id,
            payment_type: w ? payTypeFromName(w.name) : "Cash",
            currency: row.currency,
            foreign_amount: row.currency !== "MYR" ? parseFloat(row.amount) : null,
            myr_amount: myr,
            notes: sepNotes || null,
            created_by_id: myId,
            // Split only to the payer → no cross-debt, nets to zero in settlement.
            splits: [{ traveler_id: row.traveler_id, amount: myr }],
            wallet_id: row.walletId || null,
          }),
        });
        // Record this row's cashback (if any) against the created expense,
        // credited to that person. Only the rows you filled in get one — so the
        // Ryt users get a cashback record and the cash payers don't.
        const created = await res.json().catch(() => null);
        const cb = parseFloat(row.cashback);
        if (res.ok && created?.id && cb && cb > 0) {
          await fetch("/api/cashback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trip_id: id, expense_id: created.id, traveler_id: row.traveler_id, amount: cb }),
          }).catch(() => {});
        }
      }));
      router.push(`/trips/${id}/expenses`);
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  // ── Receipt OCR handlers ─────────────────────────────────────────────────
  async function handleReceiptFile(file: File) {
    setReceiptError(null);
    setReceiptResult(null);
    setReceiptParsing(true);
    try {
      // Show original immediately (object URL) so the user sees feedback fast,
      // then start compressing in background.
      const previewUrl = URL.createObjectURL(file);
      setReceiptPreview(previewUrl);

      const compressed = await compressImage(file);
      setReceiptCompressedKB(Math.round(compressed.size / 1024));

      const base64 = await blobToBase64(compressed);
      const res = await fetch("/api/ai/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: base64,
          trip_id: id,
          hint_currency: currency, // Pre-bias toward currently selected currency.
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to read receipt");
      }
      setReceiptResult(data);
      if (data.confidence === "low") {
        toast({
          kind: "warning",
          title: "Low confidence",
          body: "AI wasn't sure about some fields — please double-check before saving.",
        });
      }
    } catch (e) {
      setReceiptError((e as Error).message);
      toast({ kind: "error", title: "Receipt parse failed", body: (e as Error).message });
    } finally {
      setReceiptParsing(false);
    }
  }

  function applyReceiptToForm() {
    if (!receiptResult || !trip) return;
    // Choose which input to fill based on the parsed currency.
    const parsedCurr = (receiptResult.currency ?? "MYR").toUpperCase();
    const supportedCurr =
      parsedCurr === "MYR" || parsedCurr === trip.foreign_currency || parsedCurr === trip.foreign_currency_2
        ? parsedCurr
        : "MYR";
    setCurrency(supportedCurr);
    setForeignAmount("");
    setMyrAmount("");
    if (receiptResult.amount != null && receiptResult.amount > 0) {
      if (supportedCurr === "MYR") {
        setMyrAmount(String(receiptResult.amount));
      } else {
        setForeignAmount(String(receiptResult.amount));
      }
    }
    if (receiptResult.date) setDate(receiptResult.date);
    setCategory(receiptResult.suggested_category);
    setCategoryTouched(true); // User reviewed the suggestion via the preview.
    if (receiptResult.items.length > 0 || receiptResult.raw_text) {
      const noteParts: string[] = [];
      if (receiptResult.raw_text) noteParts.push(receiptResult.raw_text);
      if (receiptResult.items.length > 0) noteParts.push(receiptResult.items.join(", "));
      setNotes(noteParts.join(" — ").slice(0, 200));
    }
    setTab("form");
    toast({ kind: "success", title: "Receipt loaded", body: "Review the values and Save." });
  }

  function clearReceipt() {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    setReceiptResult(null);
    setReceiptError(null);
    setReceiptCompressedKB(null);
  }

  async function handleAiParse() {
    if (!aiText.trim()) return;
    setAiParsing(true); setError("");
    // Re-parsing should clear the previous result so the preview never shows
    // stale entries if the user is editing the textarea before re-parsing.
    setAiParsed(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: aiText,
          // Use the currency the user picked — if it's a foreign one, Claude
          // will treat unprefixed numbers as that currency. If MYR, it'll
          // expect "RM 50" style.
          currency: aiCurrency !== "MYR" ? aiCurrency : trip?.foreign_currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiParsed(data.entries ?? []);
      // If the user hasn't manually picked a date, accept whatever Claude
      // pulled out of the text (e.g. "lunch yesterday" → yesterday's date).
      if (!aiDateTouched && data.date) {
        setAiDate(data.date);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setAiParsing(false); }
  }

  // Pick the correct exchange rate for an entry based on the AI currency
  // selection AND the chosen wallet's name. Mirrors what the Form tab does.
  function aiRate(): number {
    if (!trip || aiCurrency === "MYR") return 1;
    const wallet = walletOptions.find((w) => w.id === aiWalletId);
    const useWise = wallet
      ? wallet.name.toLowerCase().includes("wise")
      : aiPayType === "Wise";
    if (aiCurrency === trip.foreign_currency) {
      return useWise ? trip.wise_rate : trip.cash_rate;
    }
    if (aiCurrency === trip.foreign_currency_2) {
      return useWise ? (trip.wise_rate_2 ?? 1) : (trip.cash_rate_2 ?? 1);
    }
    return 1;
  }

  function calcMyr(entry: ParsedEntry) {
    if (entry.myr_amount) return entry.myr_amount;
    if (entry.foreign_amount && trip) {
      return entry.foreign_amount / aiRate();
    }
    return 0;
  }

  async function handleAiSave() {
    if (!aiParsed || !aiPaidBy) return;
    if (aiSplitType === "individual") {
      const splitsSum = aiSplits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
      if (Math.abs(splitsSum - aiTotal) > 0.05) {
        setError(`Individual splits (RM ${splitsSum.toFixed(2)}) must equal total (RM ${aiTotal.toFixed(2)})`);
        return;
      }
    }
    setSaving(true); setError("");
    try {
      // Save all parsed entries CONCURRENTLY (was serial — N lines = N waits).
      await Promise.all(aiParsed.map(async (entry) => {
        const myr = calcMyr(entry);
        let splitData;
        if (aiSplitType === "even") {
          splitData = realTravelers.map((t) => ({ traveler_id: t.id, amount: parseFloat(evenSplitAmount(myr).toFixed(2)) }));
        } else {
          // Individual: aiSplits holds per-traveler amounts for the TOTAL of all entries
          // For each entry, distribute proportionally by myr value
          const totalAllParsed = aiParsed.reduce((s, e) => s + calcMyr(e), 0);
          const ratio = totalAllParsed > 0 ? myr / totalAllParsed : 0;
          splitData = aiSplits.map((s) => ({
            traveler_id: s.traveler_id,
            amount: parseFloat(((parseFloat(s.amount) || 0) * ratio).toFixed(2)),
          }));
        }
        await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: id,
            date: aiDate,
            category: entry.category,
            split_type: aiSplitType,
            paid_by_id: aiPaidBy,
            payment_type: aiPayType,
            currency: aiCurrency,
            foreign_amount: aiCurrency !== "MYR" ? (entry.foreign_amount ?? null) : null,
            myr_amount: myr,
            notes: entry.description,
            created_by_id: myId,
            splits: splitData,
            wallet_id: aiWalletId || null,
          }),
        });
      }));
      router.push(`/trips/${id}/expenses`);
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  if (!trip) return null;

  const aiTotal = aiParsed ? aiParsed.reduce((s, e) => s + calcMyr(e), 0) : 0;
  const aiSplitsTotal = aiSplits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);

  return (
    <>
      <Nav tripId={id} tripName={trip.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
          <h1 className="text-xl font-bold text-white">Add Expense</h1>

          <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
            <button onClick={() => setTab("form")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "form" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <ClipboardList size={14} /> Form
            </button>
            <button onClick={() => setTab("ai")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "ai" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <Sparkles size={14} /> AI Quick
            </button>
            <button onClick={() => setTab("receipt")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "receipt" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <Camera size={14} /> Receipt
            </button>
            <button onClick={() => setTab("separate")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "separate" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <Users size={14} /> Separate
            </button>
          </div>

          {tab === "form" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Date &amp; Time</label>
                  <div className="flex gap-2">
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" />
                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} title="Optional — defaults to now"
                      className="w-[88px] bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" />
                  </div></div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
                    Category
                    {categorySuggesting && (
                      <span className="text-[10px] text-emerald-400 inline-flex items-center gap-0.5">
                        <Sparkles size={9} /> suggesting…
                      </span>
                    )}
                  </label>
                  <select value={category} onChange={(e) => { setCategory(e.target.value); setCategoryTouched(true); }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Paid By</label>
                <select value={paidById} onChange={(e) => { setPaidById(e.target.value); setWalletId(""); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {activeTravelers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
                </select></div>
              {walletOptions.filter((w) => w.traveler_id === paidById).length > 0 && (
                <div><label className="text-xs text-slate-400 mb-1 block">Paid from Wallet</label>
                  <select value={walletId} onChange={(e) => {
                    const wId = e.target.value;
                    setWalletId(wId);
                    if (wId) {
                      const w = walletOptions.find((x) => x.id === wId);
                      if (w) {
                        const n = w.name.toLowerCase();
                        if (n.includes("wise")) setPaymentType("Wise");
                        else if (n.includes("credit")) setPaymentType("Credit Card");
                        else if (n.includes("debit") || n.includes("card")) setPaymentType("Debit Card");
                        else if (n.includes("tng") || n.includes("touch")) setPaymentType("TNG");
                        else setPaymentType("Cash");
                        // Lock the currency to the wallet's currency. Stops users
                        // from paying a JPY wallet with an MYR-typed amount, which
                        // would record a foreign_amount=null and wreck the wallet
                        // history (-JPY 0 entries).
                        if (w.currency && (w.currency === "MYR" || w.currency === trip.foreign_currency || w.currency === trip.foreign_currency_2)) {
                          setCurrency(w.currency);
                          // Clear stale amounts so user re-enters in the right currency.
                          setForeignAmount("");
                          setMyrAmount("");
                        }
                      }
                    }
                  }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    <option value="">— not linked to a wallet —</option>
                    {walletOptions.filter((w) => w.traveler_id === paidById).map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                    ))}
                  </select></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Payment Type</label>
                  <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
                  </select></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Split</label>
                  <select value={splitType} onChange={(e) => setSplitType(e.target.value as "even" | "individual")}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    <option value="even">Even</option>
                    <option value="individual">Individual</option>
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">
                  Currency{walletId && <span className="text-slate-500 ml-1">(locked to wallet)</span>}
                </label>
                  <select value={currency} onChange={(e) => { setCurrency(e.target.value); setForeignAmount(""); setMyrAmount(""); }}
                    disabled={!!walletId}
                    title={walletId ? "Currency is locked to the selected wallet" : ""}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed">
                    <option value="MYR">MYR</option>
                    <option value={trip.foreign_currency}>{trip.foreign_currency}</option>
                    {trip.foreign_currency_2 && <option value={trip.foreign_currency_2}>{trip.foreign_currency_2}</option>}
                  </select></div>
                <div><label className="text-xs text-slate-400 mb-1 block">{currency} Amount *</label>
                  <input type="number" value={currency === "MYR" ? myrAmount : foreignAmount}
                    onChange={(e) => currency === "MYR" ? setMyrAmount(e.target.value) : setForeignAmount(e.target.value)}
                    placeholder="e.g. 1200" step={currency === "MYR" ? "0.01" : "1"}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              </div>
              {currency === "MYR" && (
                <button type="button"
                  onClick={() => {
                    const gross = parseFloat(myrAmount);
                    if (!gross || isNaN(gross)) { setError("Type the amount first."); return; }
                    // Amount = gross − 1.2%, rounded to 2dp. Cashback = 1.2%, floored to 2dp.
                    const net = Math.round(gross * 0.988 * 100) / 100;
                    const cb = Math.floor(gross * 0.012 * 100 + 1e-6) / 100;
                    setMyrAmount(net.toFixed(2));
                    setCashback(cb.toFixed(2));
                  }}
                  className="self-start flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/60 rounded-lg px-2.5 py-1.5 transition-colors"
                  title="Treat the amount as the gross, deduct 1.2%, and fill the cashback">
                  <Calculator size={13} /> Ryt &minus;1.2% &rarr; fills amount + cashback
                </button>
              )}
              {currency !== "MYR" && myrAmount && (
                <p className="text-xs text-slate-500">≈ RM {myrAmount}</p>
              )}
              {splitType === "even" && myrAmount && (
                <p className="text-xs text-slate-500">Each person pays RM {evenSplitAmount(parseFloat(myrAmount)).toFixed(2)}</p>
              )}
              {splitType === "individual" && (
                <div className="flex flex-col gap-2">
                  {trip.foreign_currency && trip.foreign_currency !== "MYR" ? (
                    <>
                      <div className="grid grid-cols-[1fr_90px_90px] gap-2 px-1">
                        <span className="text-xs text-slate-500">Traveler</span>
                        <span className="text-xs text-slate-500 text-right">{trip.foreign_currency}</span>
                        <span className="text-xs text-slate-500 text-right">MYR</span>
                      </div>
                      {splits.map((s, i) => {
                        const t = travelers.find((x) => x.id === s.traveler_id);
                        const rate = paymentType === "Wise" ? (trip.wise_rate ?? 1) : (trip.cash_rate ?? 1);
                        return (
                          <div key={s.traveler_id} className="grid grid-cols-[1fr_90px_90px] gap-2 items-center">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t?.color }} />
                              <span className="text-sm text-slate-300 truncate">{t?.name}</span>
                            </div>
                            <input type="number" value={s.foreignAmount} step="1" placeholder="0"
                              onChange={(e) => {
                                const fv = e.target.value;
                                const myr = fv ? (parseFloat(fv) / rate).toFixed(2) : "";
                                setSplits(splits.map((x, idx) => idx === i ? { ...x, foreignAmount: fv, amount: myr } : x));
                              }}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500" />
                            <input type="number" value={s.amount} step="0.01" placeholder="0.00"
                              onChange={(e) => setSplits(splits.map((x, idx) => idx === i ? { ...x, amount: e.target.value, foreignAmount: "" } : x))}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500" />
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <label className="text-xs text-slate-400">Individual Splits (MYR)</label>
                      {splits.map((s, i) => {
                        const t = travelers.find((x) => x.id === s.traveler_id);
                        return (
                          <div key={s.traveler_id} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t?.color }} />
                            <span className="text-sm text-slate-300 flex-1">{t?.name}</span>
                            <input type="number" value={s.amount} step="0.01" placeholder="0.00"
                              onChange={(e) => setSplits(splits.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))}
                              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500" />
                          </div>
                        );
                      })}
                    </>
                  )}
                  {myrAmount && (() => {
                    const splitsSum = splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
                    const foreignSum = splits.reduce((s, x) => s + (parseFloat(x.foreignAmount) || 0), 0);
                    const diff = Math.abs(splitsSum - parseFloat(myrAmount));
                    return (
                      <div className={`text-xs ${diff > 0.05 ? "text-red-400" : "text-emerald-400"}`}>
                        {trip.foreign_currency && trip.foreign_currency !== "MYR" && foreignSum > 0
                          ? `${trip.foreign_currency} ${foreignSum.toLocaleString()} · `
                          : ""}
                        Splits: RM {splitsSum.toFixed(2)} / Total: RM {parseFloat(myrAmount).toFixed(2)}
                      </div>
                    );
                  })()}
                </div>
              )}
              <div><label className="text-xs text-slate-400 mb-1 block">Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Coins size={12} className="text-emerald-400" /> Cashback (RM) — optional
                </label>
                <input type="number" value={cashback} step="0.01" placeholder={`e.g. 1.20 to ${activeTravelers.find((t) => t.id === paidById)?.name ?? "payer"}`}
                  onChange={(e) => setCashback(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                <p className="text-[11px] text-slate-600 mt-1">Tracked for the payer — doesn&apos;t change the split. Tick it received later in Analytics. (Add per-person cashback by editing the expense.)</p>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {saving ? "Saving..." : "Save Expense"}
              </button>
            </div>
          )}

          {tab === "ai" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500">Type expenses in plain text. AI will parse them into individual entries.</p>
              <textarea value={aiText} onChange={(e) => setAiText(e.target.value)}
                placeholder="e.g. Lunch 1200 yen, Transport 450 yen, Konbini 300 yen"
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none" />
              <button onClick={handleAiParse} disabled={aiParsing || !aiText.trim()}
                className="flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                <Sparkles size={14} /> {aiParsing ? "Parsing..." : "Parse with AI"}
              </button>

              {aiParsed && aiParsed.length > 0 && (
                <>
                  {/* Parsed entries */}
                  <div className="flex flex-col gap-2">
                    {aiParsed.map((e, i) => (
                      <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white font-medium">{e.description}</p>
                          <p className="text-xs text-slate-500">{e.category}</p>
                        </div>
                        <div className="text-right">
                          {e.foreign_amount && <p className="text-xs text-slate-400">{aiCurrency} {e.foreign_amount.toLocaleString()}</p>}
                          <p className="text-sm font-bold text-white">RM {calcMyr(e).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-1">
                      <span className="text-xs text-slate-500">Total</span>
                      <span className="text-xs font-bold text-emerald-400">RM {aiTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Date + Currency — apply to every parsed entry. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Date</label>
                      <input
                        type="date"
                        value={aiDate}
                        onChange={(e) => { setAiDate(e.target.value); setAiDateTouched(true); }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">
                        Currency{aiWalletId && <span className="text-slate-500 ml-1">(locked)</span>}
                      </label>
                      <select
                        value={aiCurrency}
                        onChange={(e) => setAiCurrency(e.target.value)}
                        disabled={!!aiWalletId}
                        title={aiWalletId ? "Currency is locked to the selected wallet" : ""}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="MYR">MYR</option>
                        <option value={trip.foreign_currency}>{trip.foreign_currency}</option>
                        {trip.foreign_currency_2 && <option value={trip.foreign_currency_2}>{trip.foreign_currency_2}</option>}
                      </select>
                    </div>
                  </div>

                  {/* Paid By / Payment / Split */}
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-xs text-slate-400 mb-1 block">Paid By</label>
                      <select value={aiPaidBy} onChange={(e) => { setAiPaidBy(e.target.value); setAiWalletId(""); }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        {activeTravelers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
                      </select></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">Payment</label>
                      <select value={aiPayType} onChange={(e) => setAiPayType(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
                      </select></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">Split</label>
                      <select value={aiSplitType} onChange={(e) => setAiSplitType(e.target.value as "even" | "individual")}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        <option value="even">Even</option>
                        <option value="individual">Individual</option>
                      </select></div>
                  </div>

                  {/* Wallet — only shown if the chosen payer has wallets. Auto-syncs
                      payment_type from wallet name like the Form tab does. */}
                  {walletOptions.filter((w) => w.traveler_id === aiPaidBy).length > 0 && (
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Paid from Wallet</label>
                      <select
                        value={aiWalletId}
                        onChange={(e) => {
                          const wId = e.target.value;
                          setAiWalletId(wId);
                          if (wId) {
                            const w = walletOptions.find((x) => x.id === wId);
                            if (w) {
                              const n = w.name.toLowerCase();
                              if (n.includes("wise")) setAiPayType("Wise");
                              else if (n.includes("credit")) setAiPayType("Credit Card");
                              else if (n.includes("debit") || n.includes("card")) setAiPayType("Debit Card");
                              else if (n.includes("tng") || n.includes("touch")) setAiPayType("TNG");
                              else setAiPayType("Cash");
                              // Default currency to the wallet's currency so the
                              // numbers Claude parsed already match the right rate.
                              if (w.currency && (w.currency === "MYR" || w.currency === trip.foreign_currency || w.currency === trip.foreign_currency_2)) {
                                setAiCurrency(w.currency);
                              }
                            }
                          }
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">— not linked to a wallet —</option>
                        {walletOptions
                          .filter((w) => w.traveler_id === aiPaidBy)
                          .map((w) => (
                            <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Individual splits for AI — enter total amounts per traveler */}
                  {aiSplitType === "individual" && (
                    <div className="flex flex-col gap-2 bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
                      <p className="text-xs text-slate-500">Enter each person's share of the total (RM {aiTotal.toFixed(2)})</p>
                      {aiSplits.map((s, i) => {
                        const t = realTravelers.find((x) => x.id === s.traveler_id);
                        return (
                          <div key={s.traveler_id} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t?.color }} />
                            <span className="text-sm text-slate-300 flex-1">{t?.name}</span>
                            <input type="number" value={s.amount} step="0.01" placeholder="0.00"
                              onChange={(e) => setAiSplits(aiSplits.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))}
                              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right focus:outline-none focus:border-emerald-500" />
                          </div>
                        );
                      })}
                      <p className={`text-xs ${Math.abs(aiSplitsTotal - aiTotal) > 0.05 ? "text-red-400" : "text-emerald-400"}`}>
                        Splits: RM {aiSplitsTotal.toFixed(2)} / Total: RM {aiTotal.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {aiSplitType === "even" && (
                    <p className="text-xs text-slate-500">Each of {realTravelers.length} travelers pays RM {evenSplitAmount(aiTotal).toFixed(2)} per entry</p>
                  )}

                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <button onClick={handleAiSave} disabled={saving || !aiPaidBy}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                    {saving ? "Saving..." : `Save ${aiParsed.length} Expense${aiParsed.length > 1 ? "s" : ""}`}
                  </button>
                </>
              )}
              {error && !aiParsed && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}

          {tab === "receipt" && (
            <div className="flex flex-col gap-4">
              {/* Camera/upload input — only shown when no preview yet. The
                  `capture="environment"` hint asks the device for the rear
                  camera; falls back to file picker on desktop. */}
              {!receiptPreview && !receiptParsing && (
                <label className="cursor-pointer flex flex-col items-center justify-center gap-3 py-12 px-4 bg-slate-800/40 hover:bg-slate-800/60 border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl transition-colors">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Camera size={28} className="text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium">Snap a receipt</p>
                    <p className="text-xs text-slate-400 mt-1">Claude reads it and fills the form for you</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleReceiptFile(f);
                      // Allow re-uploading the same file later by resetting the input.
                      e.target.value = "";
                    }}
                  />
                </label>
              )}

              {/* Parsing state — show the preview thumbnail + spinner. */}
              {receiptParsing && (
                <div className="flex flex-col items-center gap-3 py-8 bg-slate-800/40 rounded-2xl">
                  {receiptPreview && (
                    <img src={receiptPreview} alt="Receipt" className="max-h-64 rounded-lg shadow-lg" />
                  )}
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm">Reading receipt…</span>
                  </div>
                  <p className="text-xs text-slate-500">This usually takes 2-5 seconds</p>
                </div>
              )}

              {/* Result preview + Apply button. */}
              {receiptResult && !receiptParsing && (
                <>
                  <div className="bg-slate-800/40 rounded-2xl p-4 flex gap-3">
                    {receiptPreview && (
                      <img src={receiptPreview} alt="Receipt" className="w-24 h-32 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl font-bold text-white">
                          {receiptResult.currency ?? "?"} {receiptResult.amount?.toLocaleString() ?? "?"}
                        </span>
                        <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold ${
                          receiptResult.confidence === "high" ? "bg-emerald-500/20 text-emerald-300" :
                          receiptResult.confidence === "medium" ? "bg-amber-500/20 text-amber-300" :
                          "bg-red-500/20 text-red-300"
                        }`}>
                          {receiptResult.confidence}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">
                        {receiptResult.date ?? "no date"} · {receiptResult.suggested_category}
                      </p>
                      {receiptResult.raw_text && (
                        <p className="text-xs text-slate-500 mb-1 truncate">{receiptResult.raw_text}</p>
                      )}
                      {receiptResult.items.length > 0 && (
                        <p className="text-xs text-slate-500 italic line-clamp-2">{receiptResult.items.join(", ")}</p>
                      )}
                      {receiptCompressedKB != null && (
                        <p className="text-[10px] text-slate-600 mt-2">Sent {receiptCompressedKB}KB to Claude</p>
                      )}
                    </div>
                    <button onClick={clearReceipt}
                      className="self-start p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                      title="Discard">
                      <X size={16} />
                    </button>
                  </div>

                  <button onClick={applyReceiptToForm}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors">
                    Use these values
                  </button>
                  <button onClick={clearReceipt}
                    className="w-full py-2 text-sm text-slate-400 hover:text-white transition-colors">
                    Try another photo
                  </button>
                </>
              )}

              {receiptError && (
                <p className="text-sm text-red-400">{receiptError}</p>
              )}

              <p className="text-xs text-slate-500 text-center mt-2 leading-relaxed">
                Tip: get the whole receipt in frame and avoid glare.
                Claude reads English, Japanese, Chinese, and Malay receipts.
              </p>
            </div>
          )}

          {tab === "separate" && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500">
                Everyone paid for their own meal at the same place. Saves one expense per person — no one owes anyone, it just records each person&apos;s own spend.
              </p>

              {/* Shared fields */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Date &amp; Time</label>
                  <div className="flex gap-2">
                    <input type="date" value={sepDate} onChange={(e) => setSepDate(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" />
                    <input type="time" value={sepTime} onChange={(e) => setSepTime(e.target.value)} title="Optional — defaults to now"
                      className="w-[88px] bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" />
                  </div></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Category</label>
                  <select value={sepCategory} onChange={(e) => setSepCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select></div>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Place / Note</label>
                <input value={sepNotes} onChange={(e) => setSepNotes(e.target.value)} placeholder="e.g. Ichiran Shinjuku"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>

              {/* One row per traveler */}
              <div className="flex flex-col gap-2">
                {sepRows.map((row, i) => {
                  const t = realTravelers.find((x) => x.id === row.traveler_id);
                  const myWallets = walletOptions.filter((w) => w.traveler_id === row.traveler_id);
                  const myr = sepRowMyr(row);
                  return (
                    <div key={row.traveler_id}
                      className={`border rounded-xl p-2.5 transition-colors ${row.enabled ? "bg-slate-800/50 border-slate-700/50" : "bg-slate-800/20 border-slate-800 opacity-60"}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={row.enabled}
                          onChange={(e) => setSepRows(sepRows.map((r, idx) => idx === i ? { ...r, enabled: e.target.checked } : r))}
                          className="accent-emerald-500 w-4 h-4" />
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t?.color }} />
                        <span className="text-sm text-white flex-1 truncate">{t?.name}</span>
                        {row.enabled && row.amount && parseFloat(row.amount) > 0 && (
                          <span className="text-sm font-semibold text-emerald-400">RM {myr.toFixed(2)}</span>
                        )}
                      </div>
                      {row.enabled && (
                        <div className="flex items-center gap-2 mt-2 pl-6">
                          <select value={row.currency}
                            onChange={(e) => setSepRows(sepRows.map((r, idx) => idx === i ? { ...r, currency: e.target.value } : r))}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                            <option value="MYR">MYR</option>
                            <option value={trip.foreign_currency}>{trip.foreign_currency}</option>
                            {trip.foreign_currency_2 && <option value={trip.foreign_currency_2}>{trip.foreign_currency_2}</option>}
                          </select>
                          <input type="number" value={row.amount} step={row.currency === "MYR" ? "0.01" : "1"} placeholder="amount"
                            onChange={(e) => setSepRows(sepRows.map((r, idx) => idx === i ? { ...r, amount: e.target.value } : r))}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-right placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                          {myWallets.length > 0 && (
                            <select value={row.walletId}
                              onChange={(e) => {
                                const wId = e.target.value;
                                const w = walletOptions.find((x) => x.id === wId);
                                setSepRows(sepRows.map((r, idx) => idx === i ? {
                                  ...r, walletId: wId,
                                  currency: (w && (w.currency === "MYR" || w.currency === trip.foreign_currency || w.currency === trip.foreign_currency_2)) ? w.currency : r.currency,
                                } : r));
                              }}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 max-w-[110px] focus:outline-none focus:border-emerald-500">
                              <option value="">wallet?</option>
                              {myWallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                          )}
                        </div>
                      )}
                      {row.enabled && (
                        <div className="flex items-center gap-1.5 mt-1.5 pl-6">
                          <Coins size={12} className="text-emerald-400/70 flex-shrink-0" />
                          <input type="number" step="0.01" value={row.cashback}
                            placeholder="cashback (RM) — only for the Ryt users, optional"
                            onChange={(e) => setSepRows(sepRows.map((r, idx) => idx === i ? { ...r, cashback: e.target.value } : r))}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                          {row.currency === "MYR" && (
                            <button type="button"
                              onClick={() => {
                                const gross = parseFloat(row.amount);
                                if (!gross || isNaN(gross)) return;
                                // Amount = gross − 1.2% (rounded 2dp); cashback = 1.2% (floored 2dp).
                                const net = Math.round(gross * 0.988 * 100) / 100;
                                const cb = Math.floor(gross * 0.012 * 100 + 1e-6) / 100;
                                setSepRows(sepRows.map((r, idx) => idx === i ? { ...r, amount: net.toFixed(2), cashback: cb.toFixed(2) } : r));
                              }}
                              className="flex-shrink-0 p-1 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/60 rounded transition-colors"
                              title="Ryt −1.2%: deduct from amount, fill cashback">
                              <Calculator size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Total + save */}
              {(() => {
                const active = sepRows.filter((r) => r.enabled && parseFloat(r.amount) > 0);
                const total = active.reduce((s, r) => s + sepRowMyr(r), 0);
                return (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-slate-500">{active.length} expense{active.length === 1 ? "" : "s"} · each pays own</span>
                    <span className="text-sm font-bold text-emerald-400">RM {total.toFixed(2)}</span>
                  </div>
                );
              })()}
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button onClick={handleSepSave} disabled={saving}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {saving ? "Saving..." : (() => {
                  const n = sepRows.filter((r) => r.enabled && parseFloat(r.amount) > 0).length;
                  return `Save ${n} Separate Bill${n === 1 ? "" : "s"}`;
                })()}
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
