const KEY = (tripId: string) => `travel_identity_${tripId}`;

export function getIdentity(tripId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY(tripId));
}

export function setIdentity(tripId: string, travelerId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY(tripId), travelerId);
}

export function clearIdentity(tripId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY(tripId));
}
