"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";
import {
  Sparkles, X, ArrowLeft, Receipt, CalendarDays, ArrowRightLeft,
  Banknote, BarChart3, Wand2, FileText, Mic,
  Loader2, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import type { Trip, Traveler, Expense } from "@/lib/supabase";
import { CATEGORIES, PAYMENT_TYPES } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────────────────
// AI Assistant FAB + multi-mode panel.
// Mounts inside the trip layout — only available on /trips/[id]/* routes
// because most modes need a trip context.
// ─────────────────────────────────────────────────────────────────────────

type Mode =
  | "menu"
  | "parse-expense"
  | "parse-itinerary"
  | "currency-convert"
  | "settlement-summary"
  | "spending-stats"
  | "ask-spending"
  | "suggest-itinerary"
  | "trip-recap"
  | "voice";

export default function AIAssistant() {
  const { id } = useParams<{ id: string }>();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");

  function reset() {
    setMode("menu");
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  if (!id) return null;

  return (
    <>
      {/* Floating button — bottom-right, above mobile nav, below toast. */}
      <button
        onClick={() => setOpen(true)}
        title="AI Assistant"
        aria-label="Open AI Assistant"
        className="fixed bottom-24 md:bottom-6 right-4 z-[150] w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white shadow-2xl flex items-center justify-center transition-transform active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0) + 6rem)" }}
      >
        <Sparkles size={22} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-end md:items-center md:justify-center"
          onClick={close}
        >
          <div
            className="w-full md:w-[min(90vw,40rem)] max-h-[85vh] md:max-h-[85vh] bg-slate-900 md:rounded-2xl rounded-t-2xl border-t md:border border-slate-700 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 flex-shrink-0">
              {mode !== "menu" && (
                <button
                  onClick={reset}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                  aria-label="Back to menu"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <Sparkles size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white flex-1">
                {modeTitle(mode)}
              </h2>
              <button
                onClick={close}
                className="p-1 text-slate-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {mode === "menu" && <MenuView tripId={id} setMode={setMode} />}
              {mode === "parse-expense" && <ParseExpenseView tripId={id} onDone={close} />}
              {mode === "parse-itinerary" && <ParseItineraryView tripId={id} onDone={close} />}
              {mode === "currency-convert" && <CurrencyConvertView tripId={id} />}
              {mode === "settlement-summary" && <SettlementSummaryView tripId={id} onClose={close} />}
              {mode === "spending-stats" && <SpendingStatsView tripId={id} />}
              {mode === "ask-spending" && <AskSpendingView tripId={id} />}
              {mode === "suggest-itinerary" && <SuggestItineraryView tripId={id} onDone={close} />}
              {mode === "trip-recap" && <TripRecapView tripId={id} />}
              {mode === "voice" && <VoiceView tripId={id} onDone={close} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function modeTitle(mode: Mode): string {
  switch (mode) {
    case "menu": return "AI Assistant";
    case "parse-expense": return "Parse Expense";
    case "parse-itinerary": return "Parse Itinerary";
    case "currency-convert": return "Currency Converter";
    case "settlement-summary": return "Settlement Summary";
    case "spending-stats": return "Spending Stats";
    case "ask-spending": return "Ask About Spending";
    case "suggest-itinerary": return "Suggest Itinerary";
    case "trip-recap": return "Trip Recap";
    case "voice": return "Voice Input";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Menu — the home view. Top: chat input + mic for asking questions about
// the app or spending (replaces the old "Ask About Spending" and "Voice
// Input" tiles). Bottom: action tiles for the explicit modes.
// ─────────────────────────────────────────────────────────────────────────

function MenuView({ tripId, setMode }: { tripId: string; setMode: (m: Mode) => void }) {
  const tiles: { mode: Mode; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; subtitle: string; color: string }[] = [
    { mode: "parse-expense",      icon: Receipt,       label: "Parse Expense",       subtitle: "Type or paste, AI fills the form", color: "text-emerald-400" },
    { mode: "parse-itinerary",    icon: CalendarDays,  label: "Parse Itinerary",     subtitle: "Free-text day plan → items",       color: "text-amber-400" },
    { mode: "currency-convert",   icon: ArrowRightLeft,label: "Currency Converter",  subtitle: "Quick math at trip rates",          color: "text-blue-400" },
    { mode: "settlement-summary", icon: Banknote,      label: "Settlement Summary",  subtitle: "Who owes whom right now",           color: "text-emerald-400" },
    { mode: "spending-stats",     icon: BarChart3,     label: "Spending Stats",      subtitle: "Quick total, by category & day",   color: "text-indigo-400" },
    { mode: "suggest-itinerary",  icon: Wand2,         label: "Suggest Activities",  subtitle: "AI ideas for a day",                color: "text-amber-400" },
    { mode: "trip-recap",         icon: FileText,      label: "Trip Recap",          subtitle: "Shareable summary text",            color: "text-slate-300" },
  ];

  // ── Chat state (lifted from the old AskSpendingView) ──────────────────
  const [question, setQuestion] = useState("");
  const [answering, setAnswering] = useState(false);
  const [exchanges, setExchanges] = useState<{ q: string; a: string }[]>([]);
  const [askError, setAskError] = useState("");

  // ── Voice recognition state for the mic button ────────────────────────
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setVoiceSupported(false);
  }, []);

  function startListening() {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setAskError("Voice not supported in this browser.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (e: { results: { isFinal: boolean; [k: number]: { transcript: string } }[] }) => {
      const result = e.results[e.results.length - 1];
      // Append interim text to the question. User can edit before sending.
      setQuestion(result[0].transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    setListening(true);
    recognition.start();
  }

  async function ask() {
    if (!question.trim() || answering) return;
    const q = question.trim();
    setQuestion("");
    setAnswering(true); setAskError("");
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, trip_id: tripId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't answer");
      setExchanges((prev) => [...prev, { q, a: data.answer ?? "(no answer)" }]);
    } catch (e) {
      setAskError((e as Error).message);
      setQuestion(q);
    } finally {
      setAnswering(false);
    }
  }

  // Quick-start suggestions shown only before any exchange has happened.
  const suggestions = [
    "How much did we spend on food?",
    "Who paid the most this week?",
    "Where can I disable notifications?",
    "How do I change the exchange rate?",
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Chat input row — always at the top, primary action of the panel. */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !answering) ask(); }}
            placeholder="Ask anything about this app or spending"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {voiceSupported && (
            <button
              onClick={startListening}
              disabled={listening || answering}
              title={listening ? "Listening…" : "Speak your question"}
              aria-label="Voice input"
              className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${
                listening
                  ? "bg-rose-600 text-white animate-pulse"
                  : "bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
              }`}
            >
              <Mic size={18} />
            </button>
          )}
          <button
            onClick={ask}
            disabled={answering || !question.trim()}
            aria-label="Send"
            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
          >
            {answering ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>

        {/* Suggestion chips — only before first message, only when input is empty */}
        {exchanges.length === 0 && question.length === 0 && !answering && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setQuestion(s)}
                className="text-xs px-2 py-1 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Conversation thread */}
        {exchanges.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
            {exchanges.map((ex, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="self-end max-w-[85%] bg-emerald-900/40 border border-emerald-800/50 rounded-2xl rounded-br-sm px-3 py-2">
                  <p className="text-sm text-white whitespace-pre-wrap">{ex.q}</p>
                </div>
                <div className="self-start max-w-[85%] bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-3 py-2">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{ex.a}</p>
                </div>
              </div>
            ))}
            {answering && (
              <div className="self-start bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-slate-400" />
                <p className="text-sm text-slate-400">Thinking…</p>
              </div>
            )}
          </div>
        )}

        {askError && <p className="text-xs text-red-400">{askError}</p>}
      </div>

      {/* Divider between chat and action tiles */}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="text-[10px] uppercase tracking-wider text-slate-600">Quick actions</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>

      {/* Action tiles for the explicit modes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {tiles.map((t) => (
          <button
            key={t.mode}
            onClick={() => setMode(t.mode)}
            className="flex items-center gap-3 px-3 py-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 rounded-xl text-left transition-colors"
          >
            <t.icon size={20} className={`${t.color} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{t.label}</p>
              <p className="text-xs text-slate-500 truncate">{t.subtitle}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Parse Expense — text in, parses via /api/parse, saves via /api/expenses.
// Each parsed entry is independently editable: tap any row to expand it
// into a mini Add-Expense form (date, paid by, wallet, payment type,
// currency, amount, split type, notes).
// ─────────────────────────────────────────────────────────────────────────

type ParsedExpense = { description: string; category: string; foreign_amount: number | null; myr_amount: number | null };

type EditableEntry = {
  // Identity
  id: string;
  // Content
  description: string;
  category: string;
  notes: string;
  // Money
  currency: string;          // "MYR" | trip.foreign_currency | trip.foreign_currency_2
  foreignAmount: string;     // string for input control
  myrAmount: string;
  // Other expense fields
  date: string;
  paidById: string;
  walletId: string;
  paymentType: string;
  splitType: "even" | "individual";
  splits: { traveler_id: string; amount: string }[];
  // UI
  expanded: boolean;
};

function ParseExpenseView({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const { data: trip } = useSWR<Trip>(`/api/trips/${tripId}`, fetcher);
  const { data: travelers } = useSWR<Traveler[]>(`/api/travelers?trip_id=${tripId}`, fetcher);
  const { data: walletsData } = useSWR<{ wallets: { id: string; name: string; currency: string; traveler_id: string }[] }>(
    `/api/wallets?trip_id=${tripId}`,
    fetcher
  );

  const active = (travelers ?? []).filter((t) => !t.archived);
  const realTravelers = active.filter((t) => !t.is_pool);
  const wallets = walletsData?.wallets ?? [];

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<EditableEntry[] | null>(null);

  // Shared defaults — applied at parse time. After that, each entry owns
  // its own copy and can override independently.
  const [sharedDate, setSharedDate] = useState(new Date().toISOString().slice(0, 10));
  const [sharedPaidBy, setSharedPaidBy] = useState("");
  const [sharedPayType, setSharedPayType] = useState("Cash");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sharedPaidBy && active[0]) setSharedPaidBy(active[0].id);
  }, [active.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick the exchange rate for a wallet (or fall back to payment type).
  function rateFor(currency: string, walletId: string, paymentType: string): number {
    if (!trip || currency === "MYR") return 1;
    const wallet = wallets.find((w) => w.id === walletId);
    const useWise = wallet
      ? wallet.name.toLowerCase().includes("wise")
      : paymentType === "Wise";
    if (currency === trip.foreign_currency) {
      return useWise ? trip.wise_rate : trip.cash_rate;
    }
    if (trip.foreign_currency_2 && currency === trip.foreign_currency_2) {
      return useWise ? (trip.wise_rate_2 ?? 1) : (trip.cash_rate_2 ?? 1);
    }
    return 1;
  }

  async function parse() {
    if (!text.trim()) return;
    setParsing(true); setError(""); setEntries(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, currency: trip?.foreign_currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      const claudeDate = data.date as string | undefined;
      const dateToUse = claudeDate || sharedDate;
      if (claudeDate) setSharedDate(claudeDate);

      // Map each parsed entry into an EditableEntry with shared defaults.
      const newEntries: EditableEntry[] = (data.entries ?? []).map((e: ParsedExpense, i: number) => {
        // Figure out the entry's currency from what Claude returned.
        const inferredCurrency = e.foreign_amount && trip?.foreign_currency
          ? trip.foreign_currency
          : "MYR";
        // Derive amounts in the currency we picked.
        const rate = rateFor(inferredCurrency, "", sharedPayType);
        const foreign = e.foreign_amount ? String(e.foreign_amount) : "";
        const myr = e.myr_amount
          ? e.myr_amount.toFixed(2)
          : e.foreign_amount
            ? (e.foreign_amount / rate).toFixed(2)
            : "0.00";
        const myrNum = parseFloat(myr);
        const splitAmt = realTravelers.length > 0 ? (myrNum / realTravelers.length).toFixed(2) : "0";
        return {
          id: `${Date.now()}-${i}`,
          description: e.description,
          category: e.category,
          notes: e.description,
          currency: inferredCurrency,
          foreignAmount: foreign,
          myrAmount: myr,
          date: dateToUse,
          paidById: sharedPaidBy || active[0]?.id || "",
          walletId: "",
          paymentType: sharedPayType,
          splitType: "even",
          splits: realTravelers.map((t) => ({ traveler_id: t.id, amount: splitAmt })),
          expanded: false,
        };
      });
      setEntries(newEntries);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function update(id: string, patch: Partial<EditableEntry>) {
    setEntries((prev) => prev?.map((e) => (e.id === id ? { ...e, ...patch } : e)) ?? null);
  }

  // When user changes currency or payment type or wallet on an entry, recompute
  // the MYR amount from foreign amount (or vice versa) at the appropriate rate.
  function recalcAmounts(
    entry: EditableEntry,
    changes: Partial<Pick<EditableEntry, "currency" | "paymentType" | "walletId" | "foreignAmount" | "myrAmount">>
  ): Partial<EditableEntry> {
    const next = { ...entry, ...changes };
    const rate = rateFor(next.currency, next.walletId, next.paymentType);
    // If foreign changed → recompute MYR.
    if ("foreignAmount" in changes) {
      const fv = parseFloat(next.foreignAmount);
      if (!isNaN(fv) && next.currency !== "MYR") {
        return { ...changes, myrAmount: (fv / rate).toFixed(2) };
      }
    }
    // If MYR changed directly while in foreign mode → recompute foreign.
    if ("myrAmount" in changes && next.currency !== "MYR") {
      const mv = parseFloat(next.myrAmount);
      if (!isNaN(mv)) {
        return { ...changes, foreignAmount: (mv * rate).toFixed(0) };
      }
    }
    // If currency/payment/wallet changed and there's a foreign amount, reconvert.
    if (("currency" in changes || "paymentType" in changes || "walletId" in changes) && next.currency !== "MYR") {
      const fv = parseFloat(next.foreignAmount);
      if (!isNaN(fv)) {
        return { ...changes, myrAmount: (fv / rate).toFixed(2) };
      }
    }
    return changes;
  }

  async function save() {
    if (!entries || entries.length === 0) return;
    // Validate individual splits if any entry uses them.
    for (const entry of entries) {
      if (entry.splitType === "individual") {
        const total = parseFloat(entry.myrAmount) || 0;
        const sum = entry.splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
        if (Math.abs(sum - total) > 0.05) {
          setError(`Splits in "${entry.description}" (RM ${sum.toFixed(2)}) must equal total (RM ${total.toFixed(2)})`);
          return;
        }
      }
    }
    setSaving(true); setError("");
    try {
      for (const entry of entries) {
        const myr = parseFloat(entry.myrAmount) || 0;
        const splitData = entry.splitType === "even"
          ? realTravelers.map((t) => ({
              traveler_id: t.id,
              amount: realTravelers.length > 0 ? parseFloat((myr / realTravelers.length).toFixed(2)) : 0,
            }))
          : entry.splits.map((s) => ({ traveler_id: s.traveler_id, amount: parseFloat(s.amount) || 0 }));

        await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: tripId,
            date: entry.date,
            category: entry.category,
            split_type: entry.splitType,
            paid_by_id: entry.paidById,
            payment_type: entry.paymentType,
            currency: entry.currency,
            foreign_amount: entry.currency !== "MYR" ? (parseFloat(entry.foreignAmount) || null) : null,
            myr_amount: myr,
            notes: entry.notes || null,
            splits: splitData,
            wallet_id: entry.walletId || null,
          }),
        });
      }
      mutate((k) => typeof k === "string" && k.includes(`trip_id=${tripId}`));
      toast({ kind: "success", title: `Saved ${entries.length} expense${entries.length === 1 ? "" : "s"}` });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. lunch sushi 4800 yen, transport 800 yen"
        rows={3}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
      />

      {/* Shared defaults — applied to each entry on parse. */}
      {!entries && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Default Date</label>
            <input type="date" value={sharedDate} onChange={(e) => setSharedDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Default Paid By</label>
            <select value={sharedPaidBy} onChange={(e) => setSharedPaidBy(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
              {active.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Default Payment</label>
            <select value={sharedPayType} onChange={(e) => setSharedPayType(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
              {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
      )}

      <button
        onClick={parse}
        disabled={parsing || !text.trim()}
        className="flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
      >
        {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {parsing ? "Parsing…" : entries ? "Re-parse" : "Parse with AI"}
      </button>

      {entries && entries.length > 0 && (
        <>
          <p className="text-xs text-slate-500">Tap any row to edit details for that entry only.</p>
          <div className="flex flex-col gap-1.5">
            {entries.map((entry) => {
              const entryWallets = wallets.filter((w) => w.traveler_id === entry.paidById);
              return (
                <div key={entry.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
                  {/* Compact summary row — always visible */}
                  <button
                    onClick={() => update(entry.id, { expanded: !entry.expanded })}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-800/60 text-left transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{entry.description || entry.category}</p>
                      <p className="text-xs text-slate-500">
                        {entry.category} · {entry.date} · {active.find((t) => t.id === entry.paidById)?.name ?? "?"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {entry.currency !== "MYR" && entry.foreignAmount && (
                        <p className="text-xs text-slate-400">{entry.currency} {Number(entry.foreignAmount).toLocaleString()}</p>
                      )}
                      <p className="text-sm font-bold text-white">RM {Number(entry.myrAmount).toFixed(2)}</p>
                    </div>
                    {entry.expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </button>

                  {/* Expanded mini-form */}
                  {entry.expanded && (
                    <div className="px-3 pb-3 flex flex-col gap-2 border-t border-slate-700/50">
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Date</label>
                          <input type="date" value={entry.date} onChange={(e) => update(entry.id, { date: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Category</label>
                          <select value={entry.category} onChange={(e) => update(entry.id, { category: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-slate-500 mb-0.5 block">Paid By</label>
                        <select value={entry.paidById} onChange={(e) => update(entry.id, { paidById: e.target.value, walletId: "" })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                          {active.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
                        </select>
                      </div>

                      {entryWallets.length > 0 && (
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Paid from Wallet</label>
                          <select value={entry.walletId} onChange={(e) => {
                            const wId = e.target.value;
                            const w = wallets.find((x) => x.id === wId);
                            let newPayType = entry.paymentType;
                            let newCurrency = entry.currency;
                            if (w) {
                              const n = w.name.toLowerCase();
                              if (n.includes("wise")) newPayType = "Wise";
                              else if (n.includes("credit")) newPayType = "Credit Card";
                              else if (n.includes("debit") || n.includes("card")) newPayType = "Debit Card";
                              else if (n.includes("tng") || n.includes("touch")) newPayType = "TNG";
                              else newPayType = "Cash";
                              if (w.currency === "MYR" || w.currency === trip?.foreign_currency || w.currency === trip?.foreign_currency_2) {
                                newCurrency = w.currency;
                              }
                            }
                            update(entry.id, recalcAmounts(entry, { walletId: wId, paymentType: newPayType, currency: newCurrency }));
                          }}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                            <option value="">— not linked —</option>
                            {entryWallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                          </select>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Payment</label>
                          <select value={entry.paymentType} onChange={(e) => update(entry.id, recalcAmounts(entry, { paymentType: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                            {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Currency</label>
                          <select value={entry.currency} onChange={(e) => update(entry.id, recalcAmounts(entry, { currency: e.target.value }))}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                            <option value="MYR">MYR</option>
                            {trip?.foreign_currency && <option value={trip.foreign_currency}>{trip.foreign_currency}</option>}
                            {trip?.foreign_currency_2 && <option value={trip.foreign_currency_2}>{trip.foreign_currency_2}</option>}
                          </select>
                        </div>
                      </div>

                      {entry.currency !== "MYR" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-500 mb-0.5 block">{entry.currency} Amount</label>
                            <input type="number" value={entry.foreignAmount} step="1"
                              onChange={(e) => update(entry.id, recalcAmounts(entry, { foreignAmount: e.target.value }))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-0.5 block">MYR Amount</label>
                            <input type="number" value={entry.myrAmount} step="0.01"
                              onChange={(e) => update(entry.id, recalcAmounts(entry, { myrAmount: e.target.value }))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">MYR Amount</label>
                          <input type="number" value={entry.myrAmount} step="0.01"
                            onChange={(e) => update(entry.id, { myrAmount: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-slate-500 mb-0.5 block">Split</label>
                        <select value={entry.splitType} onChange={(e) => update(entry.id, { splitType: e.target.value as "even" | "individual" })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                          <option value="even">Even</option>
                          <option value="individual">Individual</option>
                        </select>
                      </div>

                      {entry.splitType === "individual" && (
                        <div className="flex flex-col gap-1 bg-slate-900/40 rounded-lg p-2">
                          <p className="text-xs text-slate-500">Per-traveler share (must total RM {entry.myrAmount})</p>
                          {entry.splits.map((s, idx) => {
                            const t = realTravelers.find((x) => x.id === s.traveler_id);
                            return (
                              <div key={s.traveler_id} className="flex items-center gap-2">
                                <span className="text-xs text-slate-300 flex-1 truncate">{t?.name}</span>
                                <input type="number" value={s.amount} step="0.01"
                                  onChange={(e) => update(entry.id, {
                                    splits: entry.splits.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x),
                                  })}
                                  className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-emerald-500" />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-slate-500 mb-0.5 block">Notes</label>
                        <input type="text" value={entry.notes}
                          onChange={(e) => update(entry.id, { notes: e.target.value })}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <button onClick={save} disabled={saving} className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
            {saving ? "Saving…" : `Save ${entries.length} expense${entries.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {error && !entries && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={() => router.push(`/trips/${tripId}/add`)}
        className="text-xs text-slate-500 hover:text-slate-300 underline mt-1"
      >
        Need more options? Open the full Add Expense form →
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Parse Itinerary — natural language → itinerary items
// ─────────────────────────────────────────────────────────────────────────

type ParsedItineraryItem = {
  date: string;
  time: string | null;
  end_time: string | null;
  title: string;
  category: "flight" | "hotel" | "activity" | "food" | "transport" | "other";
  notes: string | null;
};

function ParseItineraryView({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ParsedItineraryItem[] | null>(null);
  const [error, setError] = useState("");

  async function parse() {
    if (!text.trim()) return;
    setParsing(true); setError("");
    try {
      const res = await fetch("/api/ai/parse-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, trip_id: tripId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      setItems(data.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!items || items.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/itinerary/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, data: { items } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      mutate((k) => typeof k === "string" && k.includes(`trip_id=${tripId}`));
      toast({ kind: "success", title: `Added ${data.inserted_count ?? items.length} itinerary item${items.length === 1 ? "" : "s"}` });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. July 5 morning Fushimi Inari hike, lunch udon nearby, afternoon tea ceremony 3pm at Camellia Garden"
        rows={5}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
      />
      <button
        onClick={parse}
        disabled={parsing || !text.trim()}
        className="flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
      >
        {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {parsing ? "Parsing…" : "Parse with AI"}
      </button>
      {items && items.length > 0 && (
        <>
          <div className="flex flex-col gap-1.5">
            {items.map((it, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white">{it.title}</p>
                  <span className="text-xs text-slate-500">{it.category}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {it.date}{it.time ? ` · ${it.time}${it.end_time ? `–${it.end_time}` : ""}` : ""}
                </p>
                {it.notes && <p className="text-xs text-slate-400 mt-0.5">{it.notes}</p>}
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button onClick={save} disabled={saving} className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
            {saving ? "Saving…" : `Save ${items.length} item${items.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {error && !items && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Currency Converter — pure UI, uses trip rates
// ─────────────────────────────────────────────────────────────────────────

function CurrencyConvertView({ tripId }: { tripId: string }) {
  const { data: trip } = useSWR<Trip>(`/api/trips/${tripId}`, fetcher);
  const [from, setFrom] = useState("MYR");
  const [amount, setAmount] = useState("");
  const [rateKind, setRateKind] = useState<"cash" | "wise">("cash");

  const currencies = useMemo(() => {
    const list = ["MYR"];
    if (trip?.foreign_currency) list.push(trip.foreign_currency);
    if (trip?.foreign_currency_2) list.push(trip.foreign_currency_2);
    return list;
  }, [trip]);

  function rateFor(currency: string): number {
    if (!trip || currency === "MYR") return 1;
    if (currency === trip.foreign_currency) {
      return rateKind === "wise" ? trip.wise_rate : trip.cash_rate;
    }
    if (currency === trip.foreign_currency_2) {
      return rateKind === "wise" ? (trip.wise_rate_2 ?? 1) : (trip.cash_rate_2 ?? 1);
    }
    return 1;
  }

  const value = parseFloat(amount) || 0;
  const fromRate = rateFor(from);
  // Convert to MYR first, then to each target.
  const myr = from === "MYR" ? value : value / fromRate;

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-white focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">From</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
            {currencies.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
        <button onClick={() => setRateKind("cash")} className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${rateKind === "cash" ? "bg-slate-700 text-white" : "text-slate-500"}`}>
          Cash rate
        </button>
        <button onClick={() => setRateKind("wise")} className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${rateKind === "wise" ? "bg-slate-700 text-white" : "text-slate-500"}`}>
          Wise rate
        </button>
      </div>
      {value > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex flex-col gap-1">
          <p className="text-xs text-slate-500">Equivalent to:</p>
          {currencies.filter((c) => c !== from).map((c) => {
            const toRate = rateFor(c);
            const converted = c === "MYR" ? myr : myr * toRate;
            return (
              <p key={c} className="text-base font-mono text-white">
                {c} {c === "MYR" ? converted.toFixed(2) : Math.round(converted).toLocaleString()}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Settlement Summary — narrate the current settlement state
// ─────────────────────────────────────────────────────────────────────────

type Instruction = { from: { id: string; name: string }; to: { id: string; name: string }; amount: number };
type Balance = { traveler: { id: string; name: string }; net: number };

function SettlementSummaryView({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const router = useRouter();
  const { data, isLoading } = useSWR<{ balances: Balance[]; instructions: Instruction[] }>(
    `/api/settlement?trip_id=${tripId}`,
    fetcher
  );

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-400">Loading…</div>;
  }

  const instructions = data?.instructions ?? [];
  const balances = data?.balances ?? [];
  const settled = instructions.length === 0;

  return (
    <div className="p-4 flex flex-col gap-3">
      {settled ? (
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 text-center">
          <p className="text-lg font-semibold text-emerald-300">Everyone is settled up!</p>
          <p className="text-xs text-slate-400 mt-1">No outstanding balances right now.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">
            {instructions.length} settlement{instructions.length === 1 ? "" : "s"} outstanding:
          </p>
          <div className="flex flex-col gap-1.5">
            {instructions.map((inst, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-sm text-white">
                  <span className="font-medium">{inst.from.name}</span>
                  <span className="text-slate-500 mx-2">→</span>
                  <span className="font-medium">{inst.to.name}</span>
                </p>
                <p className="text-sm font-bold text-emerald-400">RM {inst.amount.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div>
        <p className="text-xs text-slate-500 mb-1.5">Net balances:</p>
        <div className="flex flex-col gap-1">
          {balances.map((b) => (
            <div key={b.traveler.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{b.traveler.name}</span>
              <span className={`font-mono ${b.net > 0.01 ? "text-emerald-400" : b.net < -0.01 ? "text-red-400" : "text-slate-500"}`}>
                {b.net > 0 ? "+" : ""}RM {b.net.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {!settled && (
        <button
          onClick={() => { router.push(`/trips/${tripId}/settlement`); onClose(); }}
          className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Open Settlement page →
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Spending Stats — quick numbers
// ─────────────────────────────────────────────────────────────────────────

type StatsData = {
  total: number;
  byCategory: { name: string; amount: number }[];
  byDay: { date: string; amount: number }[];
  byTraveler: { id: string; name: string; amount: number }[];
};

function SpendingStatsView({ tripId }: { tripId: string }) {
  const { data, isLoading } = useSWR<StatsData>(`/api/stats?trip_id=${tripId}`, fetcher);
  const { data: trip } = useSWR<Trip & { total_budget?: number | null }>(`/api/trips/${tripId}`, fetcher);

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Loading…</div>;
  if (!data) return <div className="p-6 text-sm text-slate-400">No data yet.</div>;

  const topCategories = [...data.byCategory].sort((a, b) => b.amount - a.amount).slice(0, 3);
  const days = data.byDay.length;
  const avgPerDay = days > 0 ? data.total / days : 0;
  const budget = trip?.total_budget ?? 0;
  const pctUsed = budget > 0 ? (data.total / budget) * 100 : 0;

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Total spent</p>
        <p className="text-3xl font-bold text-white mt-1">RM {data.total.toFixed(2)}</p>
        {budget > 0 && (
          <p className={`text-xs mt-1 ${pctUsed > 100 ? "text-red-400" : pctUsed > 80 ? "text-amber-400" : "text-emerald-400"}`}>
            {pctUsed.toFixed(0)}% of RM {budget.toFixed(0)} budget
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
          <p className="text-xs text-slate-500">Days tracked</p>
          <p className="text-lg font-semibold text-white">{days}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
          <p className="text-xs text-slate-500">Avg / day</p>
          <p className="text-lg font-semibold text-white">RM {avgPerDay.toFixed(0)}</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1.5">Top categories</p>
        <div className="flex flex-col gap-1">
          {topCategories.map((c) => (
            <div key={c.name} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{c.name}</span>
              <span className="text-white font-mono">RM {c.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1.5">Spending by traveler</p>
        <div className="flex flex-col gap-1">
          {[...data.byTraveler].sort((a, b) => b.amount - a.amount).map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-300">{t.name}</span>
              <span className="text-white font-mono">RM {t.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ask About Spending — RAG-style chat
// ─────────────────────────────────────────────────────────────────────────

function AskSpendingView({ tripId }: { tripId: string }) {
  const [question, setQuestion] = useState("");
  const [answering, setAnswering] = useState(false);
  const [exchanges, setExchanges] = useState<{ q: string; a: string }[]>([]);
  const [error, setError] = useState("");

  async function ask() {
    if (!question.trim()) return;
    const q = question;
    setQuestion("");
    setAnswering(true); setError("");
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, trip_id: tripId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't answer");
      setExchanges((prev) => [...prev, { q, a: data.answer ?? "(no answer)" }]);
    } catch (e) {
      setError((e as Error).message);
      // Restore the question into the input so the user can retry.
      setQuestion(q);
    } finally {
      setAnswering(false);
    }
  }

  const suggestions = [
    "How much did we spend on food?",
    "Who paid the most this week?",
    "What's our biggest single expense?",
    "Am I on track with my budget?",
  ];

  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
        {exchanges.length === 0 && (
          <div className="text-sm text-slate-400">
            <p className="mb-2">Ask anything about your trip&apos;s expenses:</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuestion(s)}
                  className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {exchanges.map((ex, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="self-end max-w-[85%] bg-emerald-900/40 border border-emerald-800/50 rounded-2xl rounded-br-sm px-3 py-2">
              <p className="text-sm text-white whitespace-pre-wrap">{ex.q}</p>
            </div>
            <div className="self-start max-w-[85%] bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-3 py-2">
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{ex.a}</p>
            </div>
          </div>
        ))}
        {answering && (
          <div className="self-start bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin text-slate-400" />
            <p className="text-sm text-slate-400">Thinking…</p>
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !answering) ask(); }}
          placeholder="Ask a question…"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          onClick={ask}
          disabled={answering || !question.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Suggest Itinerary — AI generates ideas for a free day
// ─────────────────────────────────────────────────────────────────────────

type Suggestion = {
  time?: string;
  title: string;
  category: "flight" | "hotel" | "activity" | "food" | "transport" | "other";
  notes: string;
  estimated_cost_myr?: number;
};

function SuggestItineraryView({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  async function generate() {
    setGenerating(true); setError(""); setSuggestions(null); setSelected(new Set());
    try {
      const res = await fetch("/api/ai/suggest-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, date, trip_id: tripId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setSuggestions(data.suggestions ?? []);
      // Default-select all so the user can save fast.
      setSelected(new Set((data.suggestions ?? []).map((_: unknown, i: number) => i)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  }

  async function save() {
    if (!suggestions) return;
    const items = suggestions
      .filter((_, i) => selected.has(i))
      .map((s) => ({
        date,
        time: s.time ?? null,
        end_time: null,
        title: s.title,
        category: s.category,
        notes: s.notes,
      }));
    if (items.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/itinerary/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, data: { items } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      mutate((k) => typeof k === "string" && k.includes(`trip_id=${tripId}`));
      toast({ kind: "success", title: `Added ${items.length} item${items.length === 1 ? "" : "s"} to itinerary` });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">For date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500" />
        </div>
      </div>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. relaxed afternoon near Gion, budget RM 200"
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
      />
      <button
        onClick={generate}
        disabled={generating}
        className="flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
      >
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        {generating ? "Generating…" : "Generate suggestions"}
      </button>
      {suggestions && suggestions.length > 0 && (
        <>
          <p className="text-xs text-slate-500">Tap to toggle — selected items will be added.</p>
          <div className="flex flex-col gap-1.5">
            {suggestions.map((s, i) => {
              const on = selected.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`text-left rounded-lg px-3 py-2 border transition-colors ${on ? "bg-emerald-900/30 border-emerald-700/50" : "bg-slate-800/60 border-slate-700/50"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white">{s.title}</p>
                    <span className="text-xs text-slate-500">{s.category}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {s.time ? `${s.time} · ` : ""}{s.notes}
                  </p>
                  {s.estimated_cost_myr ? (
                    <p className="text-xs text-slate-500 mt-0.5">~RM {s.estimated_cost_myr}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={save}
            disabled={saving || selected.size === 0}
            className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          >
            {saving ? "Saving…" : `Add ${selected.size} item${selected.size === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {error && !suggestions && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Trip Recap — shareable text summary via Claude
// ─────────────────────────────────────────────────────────────────────────

function TripRecapView({ tripId }: { tripId: string }) {
  const [generating, setGenerating] = useState(false);
  const [recap, setRecap] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    setGenerating(true); setError(""); setRecap("");
    try {
      const res = await fetch("/api/ai/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRecap(data.recap ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(recap);
    } catch {
      // ignore
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      <button
        onClick={generate}
        disabled={generating}
        className="flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
      >
        {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        {generating ? "Writing…" : recap ? "Regenerate" : "Generate trip recap"}
      </button>
      {recap && (
        <>
          <textarea
            value={recap}
            onChange={(e) => setRecap(e.target.value)}
            rows={10}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none font-mono leading-relaxed"
          />
          <div className="flex gap-2">
            <button onClick={copyToClipboard} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors">
              Copy to clipboard
            </button>
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(recap)}`}
              download="trip-recap.txt"
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-center text-sm rounded-lg transition-colors"
            >
              Download .txt
            </a>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Voice Input — Web Speech API → parse expense pipeline
// ─────────────────────────────────────────────────────────────────────────

function VoiceView({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setSupported(false);
  }, []);

  function start() {
    setError(""); setTranscript("");
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (e: { results: { isFinal: boolean; [k: number]: { transcript: string } }[] }) => {
      const result = e.results[e.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);
    };
    recognition.onerror = (e: { error?: string }) => {
      setError(e.error ?? "Voice recognition error");
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    setListening(true);
    recognition.start();
  }

  async function useTranscript() {
    if (!transcript.trim()) return;
    // Hand off to parse-expense flow by routing the user to /add with the
    // transcript pre-filled via URL hash. Simpler than embedding the whole
    // ParseExpenseView again here.
    toast({ kind: "info", title: "Heard it — opening parse view", body: transcript });
    onDone();
    if (typeof window !== "undefined") {
      window.location.href = `/trips/${tripId}/add#ai=${encodeURIComponent(transcript)}`;
    }
  }

  if (!supported) {
    return (
      <div className="p-6 flex flex-col gap-3 text-center">
        <Mic size={32} className="text-slate-600 mx-auto" />
        <p className="text-sm text-slate-400">
          Voice input isn&apos;t supported in this browser. Try Chrome on Android, Safari on iOS, or Chrome on desktop.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col items-center gap-4 text-center">
      <button
        onClick={start}
        disabled={listening}
        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
          listening
            ? "bg-rose-600 animate-pulse"
            : "bg-slate-800 hover:bg-slate-700 border-2 border-slate-600"
        }`}
        aria-label="Start recording"
      >
        <Mic size={36} className={listening ? "text-white" : "text-slate-300"} />
      </button>
      <p className="text-sm text-slate-400">
        {listening
          ? "Listening… tell me an expense"
          : "Tap to start speaking. e.g. \"Lunch 50 ringgit at Sushi Zanmai paid by Darren\""}
      </p>
      {transcript && (
        <div className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5">
          <p className="text-xs text-slate-500 mb-1">Heard:</p>
          <p className="text-sm text-white">{transcript}</p>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {transcript && !listening && (
        <button
          onClick={useTranscript}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
        >
          Use this for an expense
        </button>
      )}
    </div>
  );
}
