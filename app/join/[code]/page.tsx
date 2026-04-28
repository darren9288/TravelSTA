"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Traveler, Trip } from "@/lib/supabase";
import { setIdentity, getIdentity } from "@/lib/identity";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/join?code=${code}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
      setTrip(data.trip);
      const realTravelers = (data.travelers as Traveler[]).filter((t) => !t.is_pool);
      setTravelers(realTravelers);

      // If already joined this trip, redirect straight to dashboard
      const existing = getIdentity(data.trip.id);
      if (existing) {
        router.replace(`/trips/${data.trip.id}`);
        return;
      }
      setLoading(false);
    }
    load();
  }, [code, router]);

  async function pick(travelerId: string) {
    if (!trip) return;
    setIdentity(trip.id, travelerId);
    // Register this user as a trip member with their chosen traveler identity
    await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: trip.id, traveler_id: travelerId }),
    });
    router.push(`/trips/${trip.id}`);
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl mb-3">❌</p>
        <p className="text-white font-medium">Trip not found</p>
        <p className="text-slate-500 text-sm mt-1">{error}</p>
        <button onClick={() => router.push("/")} className="mt-4 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg">
          Go Home
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-4xl mb-3">✈️</p>
          <h1 className="text-2xl font-bold text-white">{trip?.name}</h1>
          {trip?.destination && <p className="text-slate-400 text-sm mt-1">{trip.destination}</p>}
          <p className="text-xs text-slate-500 mt-3">Who are you?</p>
        </div>
        <div className="flex flex-col gap-2">
          {travelers.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className="flex items-center gap-3 px-4 py-3 bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-xl transition-colors group"
            >
              <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
              <span className="text-white font-medium group-hover:text-emerald-400 transition-colors">{t.name}</span>
            </button>
          ))}
        </div>
        {travelers.length === 0 && (
          <p className="text-center text-slate-500 text-sm">No travelers added yet. Ask the trip admin to add you.</p>
        )}
      </div>
    </div>
  );
}
