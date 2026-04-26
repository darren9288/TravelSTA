"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import TripCard from "@/components/TripCard";
import { Trip } from "@/lib/supabase";
import { Plus, Hash } from "lucide-react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/trips").then((r) => r.json()).then((d) => { setTrips(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError("");
    const res = await fetch(`/api/join?code=${joinCode.trim().toUpperCase()}`);
    const data = await res.json();
    if (!res.ok) { setJoinError(data.error); setJoining(false); return; }
    router.push(`/join/${joinCode.trim().toUpperCase()}`);
  }

  return (
    <>
      <Nav />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">My Trips ✈️</h1>
              <p className="text-sm text-slate-500 mt-0.5">Select a trip or create a new one</p>
            </div>
            <button
              onClick={() => router.push("/trips/new")}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={15} /> New Trip
            </button>
          </div>

          {/* Join by code */}
          <form onSubmit={handleJoin} className="flex gap-2">
            <div className="flex items-center gap-2 flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
              <Hash size={14} className="text-slate-500" />
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter join code (e.g. BALI26)"
                maxLength={8}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
              />
            </div>
            <button type="submit" disabled={joining || !joinCode.trim()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors">
              {joining ? "..." : "Join"}
            </button>
          </form>
          {joinError && <p className="text-xs text-red-400 -mt-4">{joinError}</p>}

          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((i) => <div key={i} className="h-24 bg-slate-800 rounded-xl animate-pulse" />)}
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p className="text-5xl mb-3">✈️</p>
              <p className="font-medium">No trips yet</p>
              <p className="text-sm mt-1">Create your first trip to get started</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {trips.map((t) => <TripCard key={t.id} trip={t} />)}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
