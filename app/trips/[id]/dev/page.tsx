"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip } from "@/lib/supabase";
import { RefreshCw, Trash2, CheckCircle, XCircle } from "lucide-react";

type LogEntry = {
  id: string;
  time: string;
  method: string;
  url: string;
  status: number | null;
  duration: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
};

// Global log store (survives re-renders, cleared on page refresh)
const LOG_KEY = "travelsta_dev_logs";

function getLogs(): LogEntry[] {
  try { return JSON.parse(sessionStorage.getItem(LOG_KEY) ?? "[]"); } catch { return []; }
}
function saveLogs(logs: LogEntry[]) {
  sessionStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-100)));
}

// Patched fetch that logs to sessionStorage
function installFetchInterceptor() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __fetchPatched?: boolean }).__fetchPatched) return;
  (window as unknown as { __fetchPatched: boolean }).__fetchPatched = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? (typeof input === "string" ? "GET" : (input as Request).method ?? "GET")).toUpperCase();
    const start = Date.now();
    let requestBody: unknown;
    try { if (init?.body) requestBody = JSON.parse(init.body as string); } catch { /* not json */ }

    const entry: LogEntry = {
      id: Math.random().toString(36).slice(2),
      time: new Date().toISOString(),
      method, url: url.startsWith("/") ? url : new URL(url).pathname + new URL(url).search,
      status: null, duration: 0, requestBody,
    };

    try {
      const res = await origFetch(input, init);
      entry.status = res.status;
      entry.duration = Date.now() - start;
      const clone = res.clone();
      try { entry.responseBody = await clone.json(); } catch { /* not json */ }
      const logs = getLogs();
      saveLogs([...logs, entry]);
      return res;
    } catch (e) {
      entry.error = (e as Error).message;
      entry.duration = Date.now() - start;
      const logs = getLogs();
      saveLogs([...logs, entry]);
      throw e;
    }
  };
}

export default function DevPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown>>({});
  const [rawLoading, setRawLoading] = useState(false);

  useEffect(() => {
    installFetchInterceptor();
    fetch(`/api/trips/${id}`).then((r) => r.json()).then((d) => setTrip(d.error ? null : d));
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [id]);

  function refresh() {
    setLogs([...getLogs()].reverse());
  }

  function clearLogs() {
    sessionStorage.removeItem(LOG_KEY);
    setLogs([]);
    setSelected(null);
  }

  async function loadRawData() {
    setRawLoading(true);
    const [travelers, expenses, pools, topups, settlement] = await Promise.all([
      fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
      fetch(`/api/expenses?trip_id=${id}`).then((r) => r.json()),
      fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
      fetch(`/api/pool?trip_id=${id}`).then((r) => r.json()),
      fetch(`/api/settlement?trip_id=${id}`).then((r) => r.json()),
    ]);
    setRawData({ travelers, expenses, pools, topups, settlement });
    setRawLoading(false);
    refresh();
  }

  const statusColor = (s: number | null) => {
    if (!s) return "text-slate-500";
    if (s < 300) return "text-emerald-400";
    if (s < 400) return "text-yellow-400";
    return "text-red-400";
  };

  const methodColor = (m: string) => {
    if (m === "GET") return "text-blue-400";
    if (m === "POST") return "text-emerald-400";
    if (m === "PUT") return "text-yellow-400";
    if (m === "DELETE") return "text-red-400";
    return "text-slate-400";
  };

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">Developer Panel</h1>
              <p className="text-xs text-slate-500 mt-0.5">Live API logs + raw data inspector</p>
            </div>
            <div className="flex gap-2">
              <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-300 text-xs rounded-lg transition-colors">
                <RefreshCw size={12} /> Refresh
              </button>
              <button onClick={clearLogs} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 border border-red-800/50 hover:bg-red-900/50 text-red-400 text-xs rounded-lg transition-colors">
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>

          {/* Raw data loader */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Raw Data Inspector</h2>
              <button onClick={loadRawData} disabled={rawLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                <RefreshCw size={12} className={rawLoading ? "animate-spin" : ""} /> Load All Data
              </button>
            </div>
            {Object.keys(rawData).length > 0 && (
              <div className="flex flex-col gap-3">
                {Object.entries(rawData).map(([key, val]) => (
                  <div key={key}>
                    <p className="text-xs text-emerald-400 font-mono mb-1">{key}</p>
                    <pre className="text-xs text-slate-300 bg-slate-900 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">
                      {JSON.stringify(val, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* API Logs */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">API Request Log</h2>
              <span className="text-xs text-slate-500">{logs.length} entries (auto-refresh 2s)</span>
            </div>
            {logs.length === 0 ? (
              <p className="text-center py-6 text-slate-600 text-sm">No requests yet. Use the app and they will appear here.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {logs.map((log) => (
                  <button key={log.id} onClick={() => setSelected(selected?.id === log.id ? null : log)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${selected?.id === log.id ? "bg-slate-700" : "hover:bg-slate-700/50"}`}>
                    <span className={`text-xs font-mono font-bold w-14 ${methodColor(log.method)}`}>{log.method}</span>
                    <span className="text-xs font-mono text-slate-300 flex-1 truncate">{log.url}</span>
                    <span className={`text-xs font-mono ${statusColor(log.status)}`}>
                      {log.status ? (
                        <span className="flex items-center gap-1">
                          {log.status < 300 ? <CheckCircle size={10} /> : <XCircle size={10} />}
                          {log.status}
                        </span>
                      ) : log.error ? <span className="text-red-400">ERR</span> : "..."}
                    </span>
                    <span className="text-xs text-slate-600 w-14 text-right">{log.duration}ms</span>
                    <span className="text-xs text-slate-600 hidden sm:block">{new Date(log.time).toLocaleTimeString()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected log detail */}
          {selected && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-bold ${methodColor(selected.method)}`}>{selected.method}</span>
                  <span className="text-sm font-mono text-white">{selected.url}</span>
                  <span className={`text-sm font-mono ${statusColor(selected.status)}`}>{selected.status}</span>
                </div>
                <span className="text-xs text-slate-500">{selected.duration}ms · {new Date(selected.time).toLocaleTimeString()}</span>
              </div>
              {selected.requestBody !== undefined && (
                <div>
                  <p className="text-xs text-yellow-400 font-mono mb-1">REQUEST BODY</p>
                  <pre className="text-xs text-slate-300 bg-slate-950 rounded-lg p-3 overflow-x-auto">{JSON.stringify(selected.requestBody, null, 2)}</pre>
                </div>
              )}
              {selected.error && (
                <div>
                  <p className="text-xs text-red-400 font-mono mb-1">ERROR</p>
                  <pre className="text-xs text-red-300 bg-slate-950 rounded-lg p-3">{selected.error}</pre>
                </div>
              )}
              {selected.responseBody !== undefined && (
                <div>
                  <p className="text-xs text-emerald-400 font-mono mb-1">RESPONSE BODY</p>
                  <pre className="text-xs text-slate-300 bg-slate-950 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">{JSON.stringify(selected.responseBody, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
