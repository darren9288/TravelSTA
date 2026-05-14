// Minimal offline write queue. When the user is on a flaky/no network,
// mutations (currently only add-expense — easy to extend later) can be
// stashed in localStorage and replayed automatically when the browser
// reports being online again.
//
// Design choices:
// - localStorage instead of IndexedDB → much simpler, fine for the small
//   number of queued items a casual user would accumulate (typically
//   1-10 expenses while wifi is out)
// - One queue, FIFO order, replayed sequentially
// - On 4xx response we DROP the item (it's a data problem, not a network
//   one, and retrying won't help). On 5xx / network error we keep it.
// - Subscribers (banner, watcher) get a coarse "something changed"
//   notification — they re-read the queue themselves.

export type QueuedOp = {
  id: string;          // local id, used only for client-side tracking
  method: "POST" | "PUT" | "DELETE";
  url: string;
  body?: unknown;      // JSON-encodable body (or absent for DELETE)
  description: string; // human-readable summary shown in the banner/toasts
  createdAt: number;
};

const STORAGE_KEY = "travelsta-offline-queue";
const listeners = new Set<() => void>();

function safeRead(): QueuedOp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(q: QueuedOp[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q));
  } catch {
    // localStorage full — silently drop the write. The next replay attempt
    // will pick up whatever is still in there.
  }
  for (const l of listeners) l();
}

export function enqueue(op: Omit<QueuedOp, "id" | "createdAt">): QueuedOp {
  const item: QueuedOp = {
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const q = safeRead();
  q.push(item);
  safeWrite(q);
  return item;
}

export function getQueue(): QueuedOp[] {
  return safeRead();
}

export function getCount(): number {
  return safeRead().length;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Attempt to send every queued operation in order. Returns counts so the
// caller can show a summary toast. Stops early on the first network error
// so we don't hammer a clearly-still-down API.
export async function drain(): Promise<{ ok: number; failed: number; dropped: number }> {
  let ok = 0;
  let failed = 0;
  let dropped = 0;
  let q = safeRead();

  while (q.length > 0) {
    const item = q[0];
    try {
      const init: RequestInit = {
        method: item.method,
        headers: { "Content-Type": "application/json" },
      };
      if (item.body !== undefined) init.body = JSON.stringify(item.body);
      const res = await fetch(item.url, init);

      if (res.ok) {
        ok++;
        q = q.slice(1);
        safeWrite(q);
        continue;
      }

      // 4xx — the request itself is malformed. Retrying won't help.
      if (res.status >= 400 && res.status < 500) {
        dropped++;
        q = q.slice(1);
        safeWrite(q);
        continue;
      }

      // 5xx — server temporarily unhappy. Stop and try again later.
      failed++;
      break;
    } catch {
      // Network / fetch error. Bail; we're probably still offline.
      failed++;
      break;
    }
  }

  return { ok, failed, dropped };
}

export function clearQueue() {
  safeWrite([]);
}
