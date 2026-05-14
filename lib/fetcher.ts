// Global SWR fetcher — used by all useSWR calls.
//
// We deliberately do NOT pass `cache: "no-store"` here:
//   - Service worker's StaleWhileRevalidate (next.config.js) serves the
//     cached copy instantly, so tab switches feel fast.
//   - SWR's in-memory cache returns previously-loaded data without any
//     network at all on the second visit.
//   - The useTripRealtime hook still forces a fresh revalidate whenever
//     someone else mutates trip data, so stale data never persists.
//   - On focus / reconnect SWR triggers its own revalidate.
//
// Net effect: instant render from cache, then fresh data within ~1 sec —
// instead of waiting the full Vercel-cold-start + Supabase roundtrip on
// every navigation.
export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Fetch error");
    return r.json();
  });
