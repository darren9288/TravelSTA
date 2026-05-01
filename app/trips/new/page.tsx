"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { TRAVELER_COLORS } from "@/lib/supabase";
import { Plus, Trash2, ChevronRight } from "lucide-react";

type TravelerDraft = { name: string; color: string };
type PoolDraft = { name: string; pool_currency: string };

const CURRENCIES = ["JPY", "IDR", "THB", "SGD", "USD", "EUR", "GBP", "KRW", "AUD"];

export default function NewTripPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currency, setCurrency] = useState("JPY");
  const [currency2, setCurrency2] = useState("None");

  // Step 2
  const [travelers, setTravelers] = useState<TravelerDraft[]>([{ name: "", color: TRAVELER_COLORS[0] }]);

  // Step 3
  const [pools, setPools] = useState<PoolDraft[]>([{ name: "Cash Pool", pool_currency: "MYR" }]);

  // Step 4
  const [cashRate, setCashRate] = useState("");
  const [wiseRate, setWiseRate] = useState("");
  const [cashRate2, setCashRate2] = useState("");
  const [wiseRate2, setWiseRate2] = useState("");

  function addTraveler() {
    setTravelers([...travelers, { name: "", color: TRAVELER_COLORS[travelers.length % TRAVELER_COLORS.length] }]);
  }
  function removeTraveler(i: number) { setTravelers(travelers.filter((_, idx) => idx !== i)); }
  function updateTraveler(i: number, field: keyof TravelerDraft, val: string) {
    setTravelers(travelers.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
  }

  function addPool() { setPools([...pools, { name: "", pool_currency: currency }]); }
  function removePool(i: number) { setPools(pools.filter((_, idx) => idx !== i)); }

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      const tripRes = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, destination,
          start_date: startDate || null,
          end_date: endDate || null,
          foreign_currency: currency,
          cash_rate: parseFloat(cashRate) || 1,
          wise_rate: parseFloat(wiseRate) || 1,
          foreign_currency_2: currency2 !== "None" ? currency2 : null,
          cash_rate_2: currency2 !== "None" ? (parseFloat(cashRate2) || 1) : null,
          wise_rate_2: currency2 !== "None" ? (parseFloat(wiseRate2) || 1) : null,
        }),
      });
      const trip = await tripRes.json();
      if (!tripRes.ok) throw new Error(trip.error);

      // Create travelers + pools
      const allTravelers = [
        ...travelers.filter((t) => t.name.trim()).map((t) => ({ ...t, trip_id: trip.id, is_pool: false })),
        ...pools.filter((p) => p.name.trim()).map((p) => ({ name: p.name, color: "#22c55e", trip_id: trip.id, is_pool: true, pool_currency: p.pool_currency })),
      ];
      if (allTravelers.length > 0) {
        await fetch("/api/travelers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(allTravelers),
        });
      }

      router.push(`/join/${trip.join_code}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? "bg-emerald-500" : "bg-slate-700"}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h1 className="text-xl font-bold text-white">Trip Details</h1>
              <div><label className="text-xs text-slate-400 mb-1 block">Trip Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japan 2026" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Destination</label>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Tokyo, Japan" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Foreign Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Second Foreign Currency (Optional)</label>
                <select value={currency2} onChange={(e) => setCurrency2(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                  <option>None</option>
                  {CURRENCIES.filter(c => c !== currency).map((c) => <option key={c}>{c}</option>)}
                </select></div>
              <button onClick={() => { if (name.trim()) setStep(2); }} disabled={!name.trim()}
                className="flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h1 className="text-xl font-bold text-white">Add Travelers</h1>
              {travelers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {TRAVELER_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => updateTraveler(i, "color", c)}
                        className="w-5 h-5 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: t.color === c ? "white" : "transparent" }} />
                    ))}
                  </div>
                  <input value={t.name} onChange={(e) => updateTraveler(i, "name", e.target.value)}
                    placeholder={`Traveler ${i + 1} name`}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                  {travelers.length > 1 && (
                    <button onClick={() => removeTraveler(i)} className="text-slate-500 hover:text-red-400 p-1 transition-colors"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
              <button onClick={addTraveler} className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors px-1">
                <Plus size={15} /> Add Traveler
              </button>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 border border-slate-600 text-slate-400 hover:text-white rounded-xl text-sm transition-colors">Back</button>
                <button onClick={() => setStep(3)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors">
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h1 className="text-xl font-bold text-white">Cash Pools</h1>
              <p className="text-sm text-slate-500">Pools track group money (cash, Wise card, etc.)</p>
              {pools.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={p.name} onChange={(e) => setPools(pools.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                    placeholder="Pool name (e.g. Cash Pool)" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                  <select value={p.pool_currency} onChange={(e) => setPools(pools.map((x, idx) => idx === i ? { ...x, pool_currency: e.target.value } : x))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500">
                    <option>MYR</option><option>{currency}</option>{currency2 !== "None" && <option>{currency2}</option>}
                  </select>
                  {pools.length > 1 && <button onClick={() => removePool(i)} className="text-slate-500 hover:text-red-400 p-1"><Trash2 size={14} /></button>}
                </div>
              ))}
              <button onClick={addPool} className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors px-1">
                <Plus size={15} /> Add Pool
              </button>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 border border-slate-600 text-slate-400 hover:text-white rounded-xl text-sm transition-colors">Back</button>
                <button onClick={() => setStep(4)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors">
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <h1 className="text-xl font-bold text-white">Conversion Rates</h1>
              <p className="text-sm text-slate-500">How many {currency} per 1 MYR?</p>
              <div><label className="text-xs text-slate-400 mb-1 block">Cash Rate (1 MYR = ? {currency})</label>
                <input type="number" value={cashRate} onChange={(e) => setCashRate(e.target.value)} placeholder="e.g. 33.5" step="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Wise Rate (1 MYR = ? {currency})</label>
                <input type="number" value={wiseRate} onChange={(e) => setWiseRate(e.target.value)} placeholder="e.g. 34.2" step="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>

              {currency2 !== "None" && (
                <>
                  <p className="text-sm text-slate-500 mt-2">How many {currency2} per 1 MYR?</p>
                  <div><label className="text-xs text-slate-400 mb-1 block">Cash Rate (1 MYR = ? {currency2})</label>
                    <input type="number" value={cashRate2} onChange={(e) => setCashRate2(e.target.value)} placeholder="e.g. 33.5" step="0.01"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                  <div><label className="text-xs text-slate-400 mb-1 block">Wise Rate (1 MYR = ? {currency2})</label>
                    <input type="number" value={wiseRate2} onChange={(e) => setWiseRate2(e.target.value)} placeholder="e.g. 34.2" step="0.01"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
                </>
              )}

              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-2 mt-2">
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 border border-slate-600 text-slate-400 hover:text-white rounded-xl text-sm transition-colors">Back</button>
                <button onClick={handleCreate} disabled={saving}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                  {saving ? "Creating..." : "Create Trip 🎉"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
