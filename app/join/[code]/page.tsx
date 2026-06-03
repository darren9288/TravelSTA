"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Traveler, Trip } from "@/lib/supabase";
import { setIdentity, clearIdentity } from "@/lib/identity";

// Sentinel used as the `joining` value while the "just viewing" (no traveler)
// button is in flight — keeps the spinner logic working without a real id.
const VIEWER_SENTINEL = "__viewer__";

// Invite-link landing page. URL: /join/<code>
//
// Flow:
//   1. Hit /api/join?code=... to look up the trip (no auth required for read).
//   2. Hit /api/me to find out if the user is signed in.
//      - Not signed in → redirect to /login?next=/join/<code>. After login
//        they land back here.
//   3. Signed in → check /api/join/membership?code=... to see if they're
//      already a trip_member with a traveler_id.
//      - Already a member → push straight to /trips/{id}, no picker.
//   4. Otherwise → show the traveler picker. Picking calls POST /api/join
//      to bind their user → traveler → trip, then redirects to the trip.

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [claimedTravelerIds, setClaimedTravelerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // 1. Fetch trip + travelers by code.
      const tripRes = await fetch(`/api/join?code=${code}`, { cache: "no-store" });
      const tripData = await tripRes.json();
      if (!tripRes.ok) {
        setError(tripData.error ?? "Trip not found");
        setLoading(false);
        return;
      }
      setTrip(tripData.trip);
      const realTravelers = (tripData.travelers as Traveler[]).filter((t) => !t.is_pool && !t.archived);
      setTravelers(realTravelers);

      // 2. Are we signed in?
      const meRes = await fetch("/api/me", { cache: "no-store" });
      const meData = await meRes.json();
      if (!meData.user) {
        // Bounce to login, keeping the invite path so we come back here.
        const next = encodeURIComponent(`/join/${code}`);
        router.replace(`/login?next=${next}`);
        return;
      }

      // `?pick=1` forces the picker even for existing members — used by the
      // dashboard's "Join as traveler" button so a viewer can upgrade to a
      // real traveler identity.
      const forcePick =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("pick") === "1";

      // 3. Already a member → straight to the trip, no picker (unless ?pick=1).
      // Covers both travelers (traveler_id set) and pure viewers (traveler_id
      // null) so neither gets re-prompted on every normal invite-link tap.
      const memRes = await fetch(`/api/join/membership?code=${code}`, { cache: "no-store" });
      const memData = await memRes.json();
      if (memRes.ok && memData.member && !forcePick) {
        if (memData.member.traveler_id) {
          // Refresh the localStorage identity so existing pages keep working.
          setIdentity(tripData.trip.id, memData.member.traveler_id);
        } else {
          // Pure viewer — make sure no stale identity lingers.
          clearIdentity(tripData.trip.id);
        }
        router.replace(`/trips/${tripData.trip.id}`);
        return;
      }

      // 4. Show the picker. Mark travelers already claimed by other accounts
      // so we don't let two accounts hijack the same identity.
      if (Array.isArray(memData?.claimed_traveler_ids)) {
        setClaimedTravelerIds(new Set(memData.claimed_traveler_ids as string[]));
      }
      setLoading(false);
    }
    load();
  }, [code, router]);

  // travelerId === null → join as a pure viewer (not tied to any person).
  async function pick(travelerId: string | null) {
    if (!trip) return;
    setJoining(travelerId ?? VIEWER_SENTINEL);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: trip.id, traveler_id: travelerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't join");
      }
      if (travelerId) setIdentity(trip.id, travelerId);
      else clearIdentity(trip.id);
      router.push(`/trips/${trip.id}`);
    } catch (e) {
      setError((e as Error).message);
      setJoining(null);
    }
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
          <p className="text-xs text-slate-500 mt-3">Join as which traveler?</p>
        </div>
        <div className="flex flex-col gap-2">
          {travelers.map((t) => {
            const claimed = claimedTravelerIds.has(t.id);
            const busy = joining === t.id;
            return (
              <button
                key={t.id}
                onClick={() => !claimed && pick(t.id)}
                disabled={claimed || joining !== null}
                title={claimed ? "Already claimed by another account" : ""}
                className={`flex items-center gap-3 px-4 py-3 bg-slate-800 border rounded-xl transition-colors group ${
                  claimed
                    ? "border-slate-800 opacity-50 cursor-not-allowed"
                    : "border-slate-700 hover:border-emerald-500"
                }`}
              >
                <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                <span className={`font-medium ${claimed ? "text-slate-500" : "text-white group-hover:text-emerald-400"} transition-colors`}>
                  {t.name}
                </span>
                {claimed && <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">Claimed</span>}
                {busy && <span className="ml-auto text-xs text-emerald-400">Joining…</span>}
              </button>
            );
          })}
        </div>

        {/* Pure-viewer option — join without claiming a traveler. Read-only
            spectator: can see expenses/settlement but isn't a payer and
            won't appear in splits. */}
        <div className="mt-3 pt-3 border-t border-slate-800">
          <button
            onClick={() => pick(null)}
            disabled={joining !== null}
            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/60 border border-slate-700 hover:border-slate-500 rounded-xl transition-colors group disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-full flex-shrink-0 bg-slate-700 flex items-center justify-center text-slate-300 text-sm">
              👁
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-white group-hover:text-slate-200">Just viewing</p>
              <p className="text-[11px] text-slate-500">Watch only — not splitting expenses</p>
            </div>
            {joining === VIEWER_SENTINEL && <span className="text-xs text-emerald-400">Joining…</span>}
          </button>
        </div>

        {travelers.length === 0 && (
          <p className="text-center text-slate-500 text-sm mt-3">No travelers added yet — you can still join as a viewer above, or ask the trip admin to add you.</p>
        )}
      </div>
    </div>
  );
}
