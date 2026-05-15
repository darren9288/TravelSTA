"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTripPresence } from "@/lib/use-presence";
import type { Traveler } from "@/lib/supabase";

// Floating "X online" indicator that mounts inside the trip layout.
// Tap to expand and see who's online + which page they're on.
//
// Visible to everyone in the trip — useful at dinner ("who's logging?")
// or when you're settling up and want to know if anyone's mid-edit.

export default function OnlinePresence() {
  const { id } = useParams<{ id: string }>();
  const [me, setMe] = useState<{ userId: string | null; travelerId: string | null }>({
    userId: null,
    travelerId: null,
  });
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Resolve current user + traveler context once.
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/travelers?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]).then(([meData, tripData, travelersData]) => {
      setMe({
        userId: (meData?.user?.id ?? null) as string | null,
        travelerId: (tripData?.my_traveler_id ?? null) as string | null,
      });
      setTravelers(Array.isArray(travelersData) ? travelersData : []);
    });
  }, [id]);

  const online = useTripPresence(id, me);

  if (!id || online.length === 0) return null;
  // Don't show "1 online" when only you're online — visually noisy.
  if (online.length === 1 && online[0].user_id === me.userId) return null;

  // Map user_id → traveler name + colour by joining presence to trip members.
  // The /api/me endpoint doesn't return per-trip traveler mapping for OTHER
  // users, so we look it up by `traveler_id` in the broadcast payload.
  function travelerFor(userTravelerId: string | null) {
    if (!userTravelerId) return null;
    return travelers.find((t) => t.id === userTravelerId) ?? null;
  }

  function pageLabel(path: string): string {
    if (path.endsWith("/expenses")) return "Expenses";
    if (path.endsWith("/settlement")) return "Settlement";
    if (path.endsWith("/add")) return "Adding…";
    if (path.endsWith("/wallets")) return "Wallets";
    if (path.endsWith("/pool")) return "Pool";
    if (path.endsWith("/analytics")) return "Analytics";
    if (path.endsWith("/settings")) return "Settings";
    if (path.endsWith("/dev")) return "Dev";
    if (path.endsWith("/import-export")) return "Import/Export";
    if (path.match(/\/trips\/[^/]+$/)) return "Dashboard";
    return "Browsing";
  }

  return (
    <>
      {/* Compact pill — shows green dots + count. Tap to expand. */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="fixed top-14 right-4 md:top-4 md:right-6 z-[140] flex items-center gap-2 px-2.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-full shadow-lg backdrop-blur-sm transition-colors"
        aria-label="Who's online"
        style={{ top: "calc(env(safe-area-inset-top, 0) + 3.5rem)" }}
      >
        <span className="relative flex">
          <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-medium text-slate-200">{online.length} online</span>
      </button>

      {/* Expanded popover */}
      {expanded && (
        <div
          className="fixed top-24 right-4 md:right-6 z-[140] w-64 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl p-3 flex flex-col gap-1.5"
          style={{ top: "calc(env(safe-area-inset-top, 0) + 6rem)" }}
        >
          <div className="flex items-center justify-between mb-1 px-1">
            <p className="text-xs font-semibold text-white">Online now</p>
            <button
              onClick={() => setExpanded(false)}
              className="text-slate-500 hover:text-white text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {online.map((u) => {
            const t = travelerFor(u.traveler_id);
            const name = t?.name ?? "Unknown user";
            const isYou = u.user_id === me.userId;
            return (
              <div
                key={u.user_id}
                className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg"
              >
                <div className="relative flex-shrink-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ backgroundColor: t?.color ?? "#475569" }}
                  >
                    {name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {name} {isYou && <span className="text-slate-500">(you)</span>}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">{pageLabel(u.page)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
