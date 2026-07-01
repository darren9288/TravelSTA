"use client";
import { SWRConfig } from "swr";

// Global SWR defaults for snappier navigation.
//
//  - revalidateOnFocus:false  — realtime (useTripRealtime) already pushes fresh
//    data on any change, so we don't need to refetch every key each time the tab
//    regains focus. This kills the "refetch storm" (5+ requests) on every alt-tab.
//  - dedupingInterval:5000    — collapses duplicate requests for the same key
//    fired within 5s (e.g. a page + its child both reading the same endpoint).
//  - keepPreviousData:true    — show the last data instantly while a revalidate
//    runs in the background, instead of flashing a loading state.
//
// Read-only behaviour: this only affects WHEN reads happen, never what is read
// or written. No effect on the database.
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 5000, keepPreviousData: true }}>
      {children}
    </SWRConfig>
  );
}
