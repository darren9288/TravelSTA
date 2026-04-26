"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, CATEGORIES, PAYMENT_TYPES } from "@/lib/supabase";
import { getIdentity } from "@/lib/identity";
import { Sparkles, ClipboardList } from "lucide-react";

type SplitEntry = { traveler_id: string; amount: string };

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
  const [foreignAmount, setForeignAmount] = useState("");
  const [myrAmount, setMyrAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<SplitEntry[]>([]);

  // AI tab
  const [aiText, setAiText] = useState("");
  const [aiParsed, setAiParsed] = useState<{ description: string; category: string; foreign_amount?: number; myr_amount?: number }[] | null>(null);
  const [aiPaidBy, setAiPaidBy] = useState("");
  const [aiPayType, setAiPayType] = useState("Cash");
  const [aiParsing, setAiParsing] = useState(false);

  useEffect(() => {
    async function load() {
      const [tripRes, travelerRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
      ]);
      setTrip(tripRes.error ? null : tripRes);
      const real = (Array.isArray(travelerRes) ? travelerRes : []) as Traveler[];
      setTravelers(real);
      const me = getIdentity(id);
      setMyId(me);
      const allPayers = real; // include pools
      const defaultPayer = me ?? (allPayers[0]?.id ?? "");
      setPaidById(defaultPayer);
      setAiPaidBy(defaultPayer);
      setSplits(real.filter((t) => !t.is_pool).map((t) => ({ traveler_id: t.id, amount: "" })));
    }
    load();
  }, [id]);

  // Auto-convert foreign to MYR
  useEffect(() => {
    if (!trip || !foreignAmount) return;
    const rate = paymentType === "Wise" ? trip.wise_rate : trip.cash_rate;
    const myr = parseFloat(foreignAmount) / rate;
    if (!isNaN(myr)) setMyrAmount(myr.toFixed(2));
  }, [foreignAmount, paymentType, trip]);

  function evenSplitAmount() {
    const real = travelers.filter((t) => !t.is_pool);
    const amt = parseFloat(myrAmount) || 0;
    return real.length > 0 ? (amt / real.length).toFixed(2) : "0.00";
  }

  async function handleSave() {
    if (!myrAmount || !paidById) { setError("Fill in amount and who paid."); return; }
    setSaving(true);
    setError("");
    try {
      const realTravelers = travelers.filter((t) => !t.is_pool);
      const splitData: SplitEntry[] = splitType === "even"
        ? realTravelers.map((t) => ({ traveler_id: t.id, amount: evenSplitAmount() }))
        : splits;

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: id,
          date, category, split_type: splitType,
          paid_by_id: paidById, payment_type: paymentType,
          foreign_amount: parseFloat(foreignAmount) || null,
          myr_amount: parseFloat(myrAmount),
          notes: notes || null,
          created_by_id: myId,
          splits: splitData.map((s) => ({ traveler_id: s.traveler_id, amount: parseFloat(s.amount) || 0 })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/trips/${id}/expenses`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function handleAiParse() {
    if (!aiText.trim()) return;
    setAiParsing(true);
    setError("");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText, currency: trip?.foreign_currency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiParsed(data.entries ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiParsing(false);
    }
  }

  async function handleAiSave() {
    if (!aiParsed || !aiPaidBy) return;
    setSaving(true);
    setError("");
    const realTravelers = travelers.filter((t) => !t.is_pool);
    try {
      for (const entry of aiParsed) {
        const myr = entry.myr_amount ?? (entry.foreign_amount && trip ? entry.foreign_amount / (aiPayType === "Wise" ? trip.wise_rate : trip.cash_rate) : 0);
        const perPerson = myr / (realTravelers.length || 1);
        await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trip_id: id, date: new Date().toISOString().slice(0, 10),
            category: entry.category, split_type: "even",
            paid_by_id: aiPaidBy, payment_type: aiPayType,
            foreign_amount: entry.foreign_amount ?? null,
            myr_amount: myr, notes: entry.description, created_by_id: myId,
            splits: realTravelers.map((t) => ({ traveler_id: t.id, amount: parseFloat(perPerson.toFixed(2)) })),
          }),
        });
      }
      router.push(`/trips/${id}/expenses`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (!trip) return null;

  return (
    <>
      <Nav tripId={id} tripName={trip.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
          <h1 className="text-xl font-bold text-white">Add Expense</h1>

          {/* Tabs */}
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
                <select value={paidById} onChange={(e) => setPaidById(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
                </select></div>

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
                <div><label className="text-xs text-slate-400 mb-1 block">{trip.foreign_currency} Amount</label>
                  <input type="number" value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)}
                    placeholder="e.g. 1200" step="1"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">MYR Amount *</label>
                  <input type="number" value={myrAmount} onChange={(e) => setMyrAmount(e.target.value)}
                    placeholder="e.g. 35.80" step="0.01"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              </div>

              {splitType === "even" && myrAmount && (
                <p className="text-xs text-slate-500">Each person pays RM {evenSplitAmount()}</p>
              )}

              {splitType === "individual" && (
                <div className="flex flex-col gap-2">
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
                  {myrAmount && (
                    <p className={`text-xs ${Math.abs(splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0) - parseFloat(myrAmount)) > 0.01 ? "text-red-400" : "text-emerald-400"}`}>
                      Splits: RM {splits.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0).toFixed(2)} / Total: RM {parseFloat(myrAmount).toFixed(2)}
                    </p>
                  )}
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
                placeholder={`e.g. Lunch 1200 yen, Transport 450 yen, Konbini 300 yen`}
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none" />
              <button onClick={handleAiParse} disabled={aiParsing || !aiText.trim()}
                className="flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                <Sparkles size={14} /> {aiParsing ? "Parsing..." : "Parse with AI"}
              </button>

              {aiParsed && aiParsed.length > 0 && (
                <>
                  <div className="flex flex-col gap-2">
                    {aiParsed.map((e, i) => (
                      <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white font-medium">{e.description}</p>
                          <p className="text-xs text-slate-500">{e.category}</p>
                        </div>
                        <div className="text-right">
                          {e.foreign_amount && <p className="text-xs text-slate-400">{trip.foreign_currency} {e.foreign_amount.toLocaleString()}</p>}
                          {e.myr_amount && <p className="text-sm font-bold text-white">RM {e.myr_amount.toFixed(2)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-slate-400 mb-1 block">Paid By</label>
                      <select value={aiPaidBy} onChange={(e) => setAiPaidBy(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                        {travelers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_pool ? " (Pool)" : ""}</option>)}
                      </select></div>
                    <div><label className="text-xs text-slate-400 mb-1 block">Payment Type</label>
                      <select value={aiPayType} onChange={(e) => setAiPayType(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                        {PAYMENT_TYPES.map((p) => <option key={p}>{p}</option>)}
                      </select></div>
                  </div>

                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <button onClick={handleAiSave} disabled={saving || !aiPaidBy}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                    {saving ? "Saving..." : `Save ${aiParsed.length} Expense${aiParsed.length > 1 ? "s" : ""}`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
