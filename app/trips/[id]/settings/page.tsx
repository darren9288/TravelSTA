"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, TRAVELER_COLORS } from "@/lib/supabase";
import { Trash2, Plus } from "lucide-react";

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Trip fields
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cashRate, setCashRate] = useState("");
  const [wiseRate, setWiseRate] = useState("");

  // New traveler
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TRAVELER_COLORS[0]);

  useEffect(() => {
    async function load() {
      const [tripRes, travelerRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
      ]);
      if (tripRes.error) return;
      setTrip(tripRes);
      setName(tripRes.name);
      setDestination(tripRes.destination ?? "");
      setStartDate(tripRes.start_date ?? "");
      setEndDate(tripRes.end_date ?? "");
      setCashRate(String(tripRes.cash_rate));
      setWiseRate(String(tripRes.wise_rate));
      setTravelers(Array.isArray(travelerRes) ? travelerRes : []);
    }
    load();
  }, [id]);

  async function saveTrip() {
    setSaving(true);
    setError(""); setSuccess("");
    const res = await fetch(`/api/trips/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, destination,
        start_date: startDate || null,
        end_date: endDate || null,
        cash_rate: parseFloat(cashRate) || 1,
        wise_rate: parseFloat(wiseRate) || 1,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else { setSuccess("Saved!"); setTrip(data); }
    setSaving(false);
  }

  async function addTraveler() {
    if (!newName.trim()) return;
    const res = await fetch("/api/travelers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ name: newName.trim(), color: newColor, trip_id: id, is_pool: false }]),
    });
    const data = await res.json();
    if (res.ok) {
      setTravelers((prev) => [...prev, ...(Array.isArray(data) ? data : [data])]);
      setNewName("");
    }
  }

  async function deleteTrip() {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    await fetch(`/api/trips/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!trip) return null;

  const realTravelers = travelers.filter((t) => !t.is_pool);
  const pools = travelers.filter((t) => t.is_pool);

  return (
    <>
      <Nav tripId={id} tripName={trip.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
          <h1 className="text-xl font-bold text-white">Settings</h1>

          {/* Trip details */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">Trip Details</h2>
            <div><label className="text-xs text-slate-400 mb-1 block">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Destination</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Cash Rate (1 MYR = ? {trip.foreign_currency})</label>
                <input type="number" value={cashRate} onChange={(e) => setCashRate(e.target.value)} step="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Wise Rate (1 MYR = ? {trip.foreign_currency})</label>
                <input type="number" value={wiseRate} onChange={(e) => setWiseRate(e.target.value)} step="0.01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" /></div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {success && <p className="text-sm text-emerald-400">{success}</p>}
            <button onClick={saveTrip} disabled={saving}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {/* Join code */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-white mb-2">Join Code</h2>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-emerald-400 font-mono tracking-widest">{trip.join_code}</span>
              <p className="text-xs text-slate-500">Share this with travelers to let them join</p>
            </div>
          </div>

          {/* Travelers */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">Travelers</h2>
            {realTravelers.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-sm text-white flex-1">{t.name}</span>
              </div>
            ))}
            {/* Add traveler */}
            <div className="flex items-center gap-2 mt-1">
              <div className="flex gap-1 flex-wrap">
                {TRAVELER_COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setNewColor(c)}
                    className="w-5 h-5 rounded-full border-2 transition-all"
                    style={{ backgroundColor: c, borderColor: newColor === c ? "white" : "transparent" }} />
                ))}
              </div>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="New traveler name"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
              <button onClick={addTraveler} disabled={!newName.trim()}
                className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Pools */}
          {pools.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-white">Pools</h2>
              {pools.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm text-white flex-1">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.pool_currency}</span>
                </div>
              ))}
            </div>
          )}

          {/* Danger zone */}
          <div className="border border-red-900/50 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h2>
            <p className="text-xs text-slate-500 mb-3">Permanently delete this trip and all its data.</p>
            <button onClick={deleteTrip}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/30 border border-red-800/50 hover:bg-red-900/50 text-red-400 text-sm rounded-lg transition-colors">
              <Trash2 size={14} /> Delete Trip
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
