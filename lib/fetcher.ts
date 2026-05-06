// Global SWR fetcher — used by all useSWR calls
export const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("Fetch error");
    return r.json();
  });
