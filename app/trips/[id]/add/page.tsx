"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, CATEGORIES, PAYMENT_TYPES } from "@/lib/supabase";
import { Sparkles, ClipboardList } from "lucide-react";

type SplitEntry = { traveler_id: string; amount: string; foreignAmount: string };
type ParsedEntry = { description: string; category: string; foreign_amount?: number; myr_amount?: number };

export default function AddExpensePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"form" | "ai">("form");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("Lunch");
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

  // AI tab
  const [aiText, setAiText] = useState("");
  const [aiParsed, setAiParsed] = useState<ParsedEntry[] | null>(null);
  const [aiPaidBy, setAiPaidBy] = useState("");
  const [aiPayType, setAiPayType] = useState("Cash");
  const [aiSplitType, setAiSplitType] = useState<"even" | "individual">("even");
  const [aiSplits, setAiSplits] = useState<SplitEntry[]>([]); // per-traveler share of TOTAL
  const [aiParsing, setAiParsing] = useState(false);

  useEffect(() => {
    async function load() {
      const [tripRes, travelerRes, walletRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
        fetch(`/api/wallets?trip_id=${id}`).then((r) => r.json()),
      ]);
      setTrip(tripRes.error ? null : tripRes);
      const all = (Array.isArray(travelerRes) ? travelerRes : []) as Traveler[];
      setTravelers(all);
      const me = tripRes.my_traveler_id ?? null;
      setMyId(me);
      const defaultPayer = me ?? (all[0]?.id ?? "");
      setPaidById(defaultPayer);
      setAiPaidBy(defaultPayer);
      const real = all.filter((t) => !t.is_pool);
      setSplits(real.map((t) => ({ traveler_id: t.id, amount: "", foreignAmount: "" })));
      setAiSplits(real.map((t) => ({ traveler_id: t.id, amount: "", foreignAmount: "" })));
      setWalletOptions(walletRes.wallets ?? []);
    }
    load();
  }, [id]);

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

  const realTravelers = travelers.filter((t) => !t.is_pool);

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
    try {
      const total = parseFloat(myrAmount);
      const splitData = splitType === "even"
        ? realTravelers.map((t) => ({ traveler_id: t.id, amount: parseFloat(evenSplitAmount(total).toFixed(2)) }))
        : splits.map((s) => ({ traveler_id: s.traveler_id, amount: parseFloat(s.amount) || 0 }));

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: id, date, category, split_type: splitType,
          paid_by_id: paidById, payment_type: paymentType,
          currency: currency,
          foreign_amount: currency !== "MYR" ? parseFloat(foreignAmount) || null : null,
          myr_amount: total, notes: notes || null, created_by_id: myId, splits: splitData,
          wallet_id: walletId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/trips/${id}/expenses`);
    } catch (e) { setError((e as Error).message); setSaving(false); }
  }

  async function handleAiParse() {
    if (!aiText.trim()) return;
    setAiParsing(true); setError("");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText, currency: trip?.foreign_currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiParsed(data.entries ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setAiParsing(false); }
  }

  function calcMyr(entry: ParsedEntry) {
    if (entry.myr_amount) return entry.myr_amount;
    if (entry.foreign_amount && trip) {
      const rate = aiPayType === "Wise" ? trip.wise_rate : trip.cash_rate;
      return entry.foreign_amount / rate;
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
      for (const entry of aiParsed) {
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
            trip_id: id, date: new Date().toISOString().slice(0, 10),
            category: entry.category, split_type: aiSplitType,
            paid_by_id: aiPaidBy, payment_type: aiPayType,
            foreign_amount: entry.foreign_amount ?? null,
            myr_amount: myr, notes: entry.description, created_by_id: myId, splits: splitData,
          }),
        });
      }
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
          </div>

          {tab === "form" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Date</label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select></div>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Paid By</label>
                <select value={paidById} onChange={(e) => { setPaidById(e.target.value); setWalletId(""); }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
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
                <div><label className="text-xs text-slate-400 mb-1 block">Currency</label>
                  <select value={currency} onChange={(e) => { setCurrency(e.target.value); setForeignAmount(""); setMyrAmount(""); }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
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
                          {e.foreign_amount && <p className="text-xs text-slate-400">{trip.foreign_currency} {e.foreign_amount.toLocaleString()}</p>}
                          <p className="text-sm font-bold text-white">RM {calcMyr(e).toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-1">
                      <span className="text-xs text-slate-500">Total</span>
                      <span className="text-xs font-bold text-emerald-400">RM {aiTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="text-xs text-slate-400 mb-1 block">Paid By</label>
                      <select value={aiPaidBy} onChange={(e) => setAiPaidBy(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500">
                        {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
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
        </div>
      </main>
    </>
  );
}
