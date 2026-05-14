"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield, ArrowLeftCircle, Trash2, KeyRound, Users, Plane,
  Search, AlertTriangle, Crown, Key, Eye, EyeOff, Save, RotateCcw, RefreshCw,
} from "lucide-react";

type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  is_super_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  trip_count: number;
};

type AdminTrip = {
  id: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  join_code: string;
  created_at: string;
  created_by_username: string | null;
  member_count: number;
  expense_count: number;
  total_myr: number;
};

type AISettings = {
  anthropic_api_key_masked: string;
  claude_proxy_url: string;
  key_source: "db" | "env";
  proxy_source: "db" | "env";
  has_key: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"users" | "trips" | "ai">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trips, setTrips] = useState<AdminTrip[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Reset password modal state
  const [resetForUser, setResetForUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // AI Token Manager state
  const [aiSettings, setAiSettings] = useState<AISettings | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newProxy, setNewProxy] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!data.is_super_admin) {
          setAllowed(false);
          return;
        }
        setAllowed(true);
        loadAll();
      });
  }, []);

  async function loadAll() {
    const [u, t] = await Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/trips", { cache: "no-store" }).then((r) => r.json()),
    ]);
    if (u.users) setUsers(u.users);
    if (t.trips) setTrips(t.trips);
    // Surface the underlying error rather than silently showing "No users yet".
    const errors: string[] = [];
    if (u.error) errors.push(`Users: ${u.error}`);
    if (t.error) errors.push(`Trips: ${t.error}`);
    if (errors.length) setError(errors.join(" · "));
    // Token manager lives in its own tab — load lazily but kick it off so the tab is ready when clicked.
    loadAISettings();
  }

  async function loadAISettings() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/ai-settings", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setAiSettings(data);
    } finally {
      setAiLoading(false);
    }
  }

  async function saveToken() {
    if (!newKey.trim()) {
      setAiMessage({ kind: "error", text: "Paste a new token first." });
      return;
    }
    setAiSaving(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anthropic_api_key: newKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMessage({ kind: "error", text: data.error ?? "Failed to update" });
        return;
      }
      setAiMessage({ kind: "success", text: "Token updated — active for all AI calls across every trip." });
      setNewKey("");
      await loadAISettings();
    } finally {
      setAiSaving(false);
    }
  }

  async function saveProxy() {
    setAiSaving(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claude_proxy_url: newProxy.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMessage({ kind: "error", text: data.error ?? "Failed to update" });
        return;
      }
      setAiMessage({ kind: "success", text: "Proxy URL updated." });
      setNewProxy("");
      await loadAISettings();
    } finally {
      setAiSaving(false);
    }
  }

  async function clearOverride(field: "key" | "proxy") {
    if (!confirm(`Clear the ${field === "key" ? "API token" : "proxy URL"} override and fall back to the deploy-time environment variable?`)) {
      return;
    }
    setAiSaving(true);
    setAiMessage(null);
    try {
      const body = field === "key" ? { anthropic_api_key: null } : { claude_proxy_url: null };
      const res = await fetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMessage({ kind: "error", text: data.error ?? "Failed to clear" });
        return;
      }
      setAiMessage({ kind: "success", text: "Override cleared — using environment variable." });
      await loadAISettings();
    } finally {
      setAiSaving(false);
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`Delete user "${u.username}"? They will be removed from every trip. This cannot be undone.`)) return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to delete"); return; }
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  }

  async function toggleSuperAdmin(u: AdminUser) {
    const next = !u.is_super_admin;
    const verb = next ? "grant" : "revoke";
    if (!confirm(`Are you sure you want to ${verb} super admin status for "${u.username}"?`)) return;
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: u.id, is_super_admin: next }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to update"); return; }
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_super_admin: next } : x));
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetForUser) return;
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setResetting(true);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: resetForUser.id, password: newPassword }),
    });
    const data = await res.json();
    setResetting(false);
    if (!res.ok) { setError(data.error ?? "Failed to reset"); return; }
    setResetForUser(null);
    setNewPassword("");
    alert(`Password reset for "${resetForUser.username}". Share the new password with them.`);
  }

  async function deleteTrip(t: AdminTrip) {
    if (!confirm(`Delete trip "${t.name}"? All expenses, wallets and members will be permanently lost.`)) return;
    const res = await fetch("/api/admin/trips", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: t.id }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to delete"); return; }
    setTrips((prev) => prev.filter((x) => x.id !== t.id));
  }

  if (allowed === null) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  if (allowed === false) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <Shield size={32} className="text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-sm text-slate-500 mb-4">
            This page is restricted to super admins only.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  const filteredUsers = users.filter((u) =>
    !search ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredTrips = trips.filter((t) =>
    !search ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.destination ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (t.created_by_username ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        <Link
          href="/"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors w-fit"
        >
          <ArrowLeftCircle size={13} /> Back to App
        </Link>

        <div className="flex items-center gap-2">
          <Shield size={22} className="text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        </div>
        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-200">
            You have full control over every account and trip in the system. Actions here cannot be undone.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800">
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "users"
                ? "border-purple-400 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Users size={14} /> Users ({users.length})
          </button>
          <button
            onClick={() => setTab("trips")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "trips"
                ? "border-purple-400 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Plane size={14} /> Trips ({trips.length})
          </button>
          <button
            onClick={() => setTab("ai")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "ai"
                ? "border-purple-400 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Key size={14} /> AI Settings
          </button>
        </div>

        {/* Search — hidden on AI tab since there's nothing to search there */}
        {tab !== "ai" && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "users" ? "Search users…" : "Search trips…"}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2 text-sm text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-200 ml-2">×</button>
          </div>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div className="flex flex-col gap-2">
            {filteredUsers.map((u) => (
              <div key={u.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-white">{u.username}</span>
                    {u.is_super_admin && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-900/60 text-purple-300 rounded-full">
                        <Crown size={10} /> super admin
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {u.trip_count} trips · joined {new Date(u.created_at).toLocaleDateString()}
                    {u.last_sign_in_at && ` · last seen ${new Date(u.last_sign_in_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => toggleSuperAdmin(u)}
                  className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-purple-300 bg-slate-900/60 hover:bg-purple-900/30 border border-slate-700 hover:border-purple-700 rounded-lg transition-colors"
                  title={u.is_super_admin ? "Revoke super admin" : "Grant super admin"}
                >
                  <Crown size={12} className="inline mr-1" />
                  {u.is_super_admin ? "Revoke admin" : "Make admin"}
                </button>
                <button
                  onClick={() => { setResetForUser(u); setNewPassword(""); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-300 hover:text-amber-300 bg-slate-900/60 hover:bg-amber-900/30 border border-slate-700 hover:border-amber-700 rounded-lg transition-colors"
                >
                  <KeyRound size={12} /> Reset password
                </button>
                <button
                  onClick={() => deleteUser(u)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/50 rounded-lg transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">
                {search ? "No users match your search." : "No users yet."}
              </p>
            )}
          </div>
        )}

        {/* Trips tab */}
        {tab === "trips" && (
          <div className="flex flex-col gap-2">
            {filteredTrips.map((t) => (
              <div key={t.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.destination || "no destination"}
                    {t.created_by_username && ` · by ${t.created_by_username}`}
                    {" · "}
                    {t.member_count} member{t.member_count === 1 ? "" : "s"}
                    {" · "}
                    {t.expense_count} expense{t.expense_count === 1 ? "" : "s"}
                    {" · "}
                    RM {t.total_myr.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    code <span className="font-mono">{t.join_code}</span> · created {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/trips/${t.id}`}
                  className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-emerald-300 bg-slate-900/60 hover:bg-emerald-900/30 border border-slate-700 hover:border-emerald-700 rounded-lg transition-colors"
                >
                  Open
                </Link>
                <button
                  onClick={() => deleteTrip(t)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/50 rounded-lg transition-colors"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            ))}
            {filteredTrips.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-8">
                {search ? "No trips match your search." : "No trips yet."}
              </p>
            )}
          </div>
        )}

        {/* AI Settings tab — global Anthropic token + proxy URL */}
        {tab === "ai" && (
          <div className="flex flex-col gap-4">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex items-start gap-2">
              <Key size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                This token powers every AI feature (Parse Expense, Ask, Recap, Itinerary, Categorize) across <span className="text-white font-semibold">all trips</span> — it&apos;s billed to one Anthropic account. Rotate it here when the current key hits its monthly cap.
              </p>
            </div>

            {aiMessage && (
              <div className={`rounded-xl px-3 py-2 text-sm flex items-center justify-between border ${
                aiMessage.kind === "success"
                  ? "bg-emerald-950/40 border-emerald-900/60 text-emerald-300"
                  : "bg-red-950/40 border-red-900/60 text-red-300"
              }`}>
                <span>{aiMessage.text}</span>
                <button onClick={() => setAiMessage(null)} className="ml-2 opacity-60 hover:opacity-100">×</button>
              </div>
            )}

            {aiSettings ? (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-4">
                {/* Current token */}
                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/40">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="text-xs font-mono text-slate-400">CURRENT TOKEN</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        aiSettings.key_source === "db"
                          ? "bg-emerald-900/40 text-emerald-400 border border-emerald-700/40"
                          : "bg-slate-700/60 text-slate-400 border border-slate-600/40"
                      }`}>
                        {aiSettings.key_source === "db" ? "OVERRIDE ACTIVE" : "USING ENV VAR"}
                      </span>
                      <button
                        onClick={() => setShowKey((s) => !s)}
                        className="text-slate-400 hover:text-white"
                        title={showKey ? "Hide" : "Show fingerprint"}
                      >
                        {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button
                        onClick={loadAISettings}
                        disabled={aiLoading}
                        className="text-slate-400 hover:text-white disabled:opacity-40"
                        title="Reload"
                      >
                        <RefreshCw size={12} className={aiLoading ? "animate-spin" : ""} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-mono text-white break-all">
                    {showKey
                      ? aiSettings.anthropic_api_key_masked
                      : "•".repeat(Math.min(aiSettings.anthropic_api_key_masked.length, 24))}
                  </p>
                  {!aiSettings.has_key && (
                    <p className="text-xs text-red-400 mt-2">
                      No token configured — AI features will fail. Paste one below.
                    </p>
                  )}
                  {aiSettings.updated_at && aiSettings.key_source === "db" && (
                    <p className="text-[11px] text-slate-500 mt-2">
                      Last changed {new Date(aiSettings.updated_at).toLocaleString()}
                      {aiSettings.updated_by ? ` by ${aiSettings.updated_by}` : ""}
                    </p>
                  )}
                </div>

                {/* Paste new token */}
                <div>
                  <label className="text-xs font-mono text-slate-400 block mb-1.5">PASTE NEW TOKEN</label>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="password"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      autoComplete="off"
                      className="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs font-mono rounded-md px-3 py-2 outline-none"
                    />
                    <button
                      onClick={saveToken}
                      disabled={aiSaving || !newKey.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-md transition-colors whitespace-nowrap"
                    >
                      <Save size={12} />
                      {aiSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Stored in the database. Takes effect immediately, no redeploy needed.
                  </p>
                </div>

                {/* Clear override */}
                {aiSettings.key_source === "db" && (
                  <button
                    onClick={() => clearOverride("key")}
                    disabled={aiSaving}
                    className="self-start flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700/40 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-xs rounded-md transition-colors"
                  >
                    <RotateCcw size={11} />
                    Clear override (use env var)
                  </button>
                )}

                {/* Proxy URL — collapsed by default */}
                <details className="border-t border-slate-700/50 pt-3">
                  <summary className="cursor-pointer text-xs text-slate-400 hover:text-white select-none">
                    Advanced: Proxy URL ({aiSettings.proxy_source === "db" ? "override active" : "from env"})
                  </summary>
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-[11px] text-slate-500">
                      Where AI requests go. Default is Anthropic direct. Set this to a MIRBUDS / LiteLLM / OpenRouter Claude endpoint to route through a proxy instead.
                    </p>
                    <p className="text-xs font-mono text-slate-300 bg-slate-900/60 rounded px-2 py-1.5 break-all border border-slate-700/40">
                      {aiSettings.claude_proxy_url}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="text"
                        value={newProxy}
                        onChange={(e) => setNewProxy(e.target.value)}
                        placeholder="https://api.anthropic.com"
                        className="flex-1 min-w-[200px] bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs font-mono rounded-md px-3 py-2 outline-none"
                      />
                      <button
                        onClick={saveProxy}
                        disabled={aiSaving || !newProxy.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-md transition-colors whitespace-nowrap"
                      >
                        <Save size={12} /> Save
                      </button>
                    </div>
                    {aiSettings.proxy_source === "db" && (
                      <button
                        onClick={() => clearOverride("proxy")}
                        disabled={aiSaving}
                        className="self-start flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700/40 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-xs rounded-md transition-colors"
                      >
                        <RotateCcw size={11} /> Clear override
                      </button>
                    )}
                  </div>
                </details>
              </div>
            ) : aiLoading ? (
              <p className="text-sm text-slate-500 text-center py-8">Loading token info…</p>
            ) : (
              <p className="text-sm text-slate-500 text-center py-8">
                Couldn&apos;t load token info. Run migration <code className="text-emerald-400">016_app_settings.sql</code> in Supabase first.
              </p>
            )}
          </div>
        )}

        {/* Reset password modal */}
        {resetForUser && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center px-4 z-50"
            onClick={() => setResetForUser(null)}
          >
            <form
              onSubmit={submitReset}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3"
            >
              <h2 className="text-base font-semibold text-white">
                Reset password for{" "}
                <span className="font-mono text-purple-400">{resetForUser.username}</span>
              </h2>
              <p className="text-xs text-slate-500">
                Set a new password for this user. They will need to use it on their next sign-in.
              </p>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 6 chars)"
                autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setResetForUser(null)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting || newPassword.length < 6}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {resetting ? "Resetting…" : "Reset"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
