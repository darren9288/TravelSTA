"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

// Tracks who's currently in this trip via Supabase Realtime Presence.
// Each connected client broadcasts a small payload (user_id, traveler_id,
// page path) on the `presence-{tripId}` channel. All other clients receive
// a sync event whenever someone joins, leaves, or moves to a new page.
//
// Returns the list of online users — each entry is a single device session.
// Two devices logged in as the same user → two entries with the same user_id.

export type OnlineUser = {
  user_id: string;
  traveler_id: string | null;
  page: string;            // current path, e.g. "/trips/abc/expenses"
  joined_at: string;       // ISO timestamp of when this session connected
};

export function useTripPresence(
  tripId: string | undefined,
  me: { userId: string | null; travelerId: string | null }
): OnlineUser[] {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!tripId || !me.userId) return;
    const supabase = createClient();
    const channel = supabase.channel(`presence-${tripId}`, {
      config: { presence: { key: me.userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, OnlineUser[]>;
        // Flatten — each user_id may have multiple session entries (one per
        // tab/device). We dedupe to one row per user_id, picking the most
        // recently joined session as "their" current page.
        const seen = new Map<string, OnlineUser>();
        for (const [, sessions] of Object.entries(state)) {
          for (const s of sessions) {
            const existing = seen.get(s.user_id);
            if (!existing || s.joined_at > existing.joined_at) {
              seen.set(s.user_id, s);
            }
          }
        }
        setUsers(Array.from(seen.values()));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: me.userId,
            traveler_id: me.travelerId,
            page: typeof window !== "undefined" ? window.location.pathname : "/",
            joined_at: new Date().toISOString(),
          } as OnlineUser);
        }
      });

    // Re-broadcast when the user navigates so the page field stays fresh.
    const handlePathChange = () => {
      channel.track({
        user_id: me.userId,
        traveler_id: me.travelerId,
        page: window.location.pathname,
        joined_at: new Date().toISOString(),
      } as OnlineUser).catch(() => {});
    };
    // Browser back/forward + pushState changes.
    window.addEventListener("popstate", handlePathChange);
    // Listen for next/navigation pushes — Next.js patches history.pushState.
    const origPush = history.pushState;
    history.pushState = function (...args) {
      origPush.apply(this, args);
      handlePathChange();
    };

    return () => {
      window.removeEventListener("popstate", handlePathChange);
      history.pushState = origPush;
      supabase.removeChannel(channel);
    };
  }, [tripId, me.userId, me.travelerId]);

  return users;
}
