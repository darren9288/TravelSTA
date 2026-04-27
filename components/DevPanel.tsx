"use client";
import { useEffect, useRef, useState } from "react";
import { Terminal, X, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

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

const LOG_KEY = "travelsta_dev_logs";

function getLogs(): LogEntry[] {
  try { return JSON.parse(sessionStorage.getItem(LOG_KEY) ?? "[]"); } catch { return []; }
}
function saveLogs(logs: LogEntry[]) {
  sessionStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-100)));
}

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
      method,
      url: url.startsWith("/") ? url : new URL(url).pathname + new URL(url).search,
      status: null, duration: 0, requestBody,
    };
    try {
      const res = await origFetch(input, init);
      entry.status = res.status;
      entry.duration = Date.now() - start;
      try { entry.responseBody = await res.clone().json(); } catch { /* not json */ }
      saveLogs([...getLogs(), entry]);
      return res;
    } catch (e) {
      entry.error = (e as Error).message;
      entry.duration = Date.now() - start;
      saveLogs([...getLogs(), entry]);
      throw e;
    }
  };
}

const methodColor = (m: string) => {
  if (m === "GET") return "text-blue-400";
  if (m === "POST") return "text-emerald-400";
  if (m === "PUT") return "text-yellow-400";
  if (m === "DELETE") return "text-red-400";
  return "text-slate-400";
};

const statusColor = (s: number | null) => {
  if (!s) return "text-slate-500";
  if (s < 300) return "text-emerald-400";
  if (s < 400) return "text-yellow-400";
  return "text-red-400";
};

export default function DevPanel() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [detailTab, setDetailTab] = useState<"response" | "request">("response");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    installFetchInterceptor();
    const tick = () => setLogs([...getLogs()].reverse());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // auto-scroll to top (newest) when new logs arrive
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = 0;
  }, [logs.length, open]);

  function clearLogs() {
    sessionStorage.removeItem(LOG_KEY);
    setLogs([]);
    setSelected(null);
  }

  const errorCount = logs.filter((l) => l.status && l.status >= 400 || l.error).length;

  return (
    <div className="fixed bottom-20 md:bottom-4 right-3 z-[200] flex flex-col items-end gap-2">
      {open && (
        <div className="w-80 md:w-[420px] bg-slate-950 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: "min(520px, calc(100vh - 120px))" }}>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-emerald-400" />
              <span className="text-xs font-mono text-emerald-400 font-semibold">API Logs</span>
              <span className="text-xs text-slate-600">{logs.length} entries</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearLogs}
                className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded">
                <Trash2 size={11} />
              </button>
              <button onClick={() => setOpen(false)}
                className="p-1 text-slate-500 hover:text-white transition-colors rounded">
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Log list */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
            {logs.length === 0 ? (
              <p className="text-center py-8 text-slate-600 text-xs font-mono">No requests yet</p>
            ) : (
              logs.map((log) => (
                <button key={log.id}
                  onClick={() => setSelected(selected?.id === log.id ? null : log)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left border-b border-slate-800/60 transition-colors ${selected?.id === log.id ? "bg-slate-800" : "hover:bg-slate-900"}`}>
                  <span className={`text-xs font-mono font-bold flex-shrink-0 w-9 ${methodColor(log.method)}`}>{log.method}</span>
                  <span className="text-xs font-mono text-slate-400 flex-1 truncate min-w-0">{log.url}</span>
                  <span className={`text-xs font-mono flex-shrink-0 flex items-center gap-0.5 ${statusColor(log.status)}`}>
                    {log.status ? (
                      <>{log.status < 300 ? <CheckCircle size={9} /> : <XCircle size={9} />}{log.status}</>
                    ) : log.error ? <span className="text-red-400">ERR</span> : "…"}
                  </span>
                  <span className="text-xs text-slate-600 flex-shrink-0 w-12 text-right">{log.duration}ms</span>
                  <span className="text-xs text-slate-700 flex-shrink-0 hidden sm:block w-16 text-right">
                    {new Date(log.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  {selected?.id === log.id ? <ChevronUp size={10} className="text-slate-500 flex-shrink-0" /> : <ChevronDown size={10} className="text-slate-600 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>

          {/* Detail pane */}
          {selected && (
            <div className="border-t border-slate-700 flex-shrink-0 bg-slate-900">
              <div className="flex items-center gap-1 px-3 pt-2 pb-1">
                <button onClick={() => setDetailTab("response")}
                  className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${detailTab === "response" ? "bg-emerald-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                  Response
                </button>
                {selected.requestBody !== undefined && (
                  <button onClick={() => setDetailTab("request")}
                    className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${detailTab === "request" ? "bg-yellow-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                    Request
                  </button>
                )}
                {selected.error && (
                  <span className="text-xs text-red-400 font-mono ml-auto">{selected.error}</span>
                )}
                <span className="text-xs text-slate-600 font-mono ml-auto">{selected.duration}ms</span>
              </div>
              <pre className="text-xs text-slate-300 font-mono px-3 pb-3 overflow-auto max-h-48 leading-relaxed">
                {detailTab === "response"
                  ? JSON.stringify(selected.responseBody ?? selected.error ?? "(empty)", null, 2)
                  : JSON.stringify(selected.requestBody, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-semibold shadow-lg border transition-colors ${
          open
            ? "bg-slate-800 border-slate-600 text-slate-300"
            : errorCount > 0
              ? "bg-red-900/80 border-red-700 text-red-300 hover:bg-red-900"
              : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300"
        }`}>
        <Terminal size={13} />
        {open ? "Hide" : "Dev"}
        {!open && errorCount > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
            {errorCount > 9 ? "9+" : errorCount}
          </span>
        )}
      </button>
    </div>
  );
}
