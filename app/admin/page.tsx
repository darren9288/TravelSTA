"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield, ArrowLeftCircle, Trash2, KeyRound, Users, Plane,
  Search, AlertTriangle, Crown, Key, Save, RefreshCw, Check, X, Play, Loader2, Plus,
  Activity, DollarSign, Calendar,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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

type TokenRow = {
  id: string;
  label: string | null;
  anthropic_api_key_masked: string;
  claude_proxy_url: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_result: "success" | "fail" | null;
  last_test_error: string | null;
  last_test_latency_ms: number | null;
  created_at: string;
};

type EffectiveAI = {
  source: "db" | "env";
  key_masked: string;
  base_url: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"users" | "trips" | "ai" | "usage">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trips, setTrips] = useState<AdminTrip[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Reset password modal state
  const [resetForUser, setResetForUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  // AI Token Manager state — list of tokens with per-row test results.
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [effective, setEffective] = useState<EffectiveAI | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensBusy, setTokensBusy] = useState(false);    // global save/activate/delete spinner
  const [testingId, setTestingId] = useState<string | null>(null); // which row is currently being tested
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newProxy, setNewProxy] = useState("");
  const [aiMessage, setAiMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // ── AI Usage tab ──────────────────────────────────────────────────────
  type UsageSummary = { calls: number; input_tokens: number; output_tokens: number; est_usd: number };
  type DailyUsage = { date: string } & UsageSummary;
  type RouteUsage = { route: string } & UsageSummary;
  const [usage, setUsage] = useState<{
    current_month: UsageSummary;
    all_time: UsageSummary;
    last_30_days: DailyUsage[];
    by_route: RouteUsage[];
  } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  async function loadUsage() {
    setUsageLoading(true);
    try {
      const res = await fetch("/api/admin/ai-usage", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setUsage(data);
    } finally {
      setUsageLoading(false);
    }
  }
  // Re-fetch usage whenever the user opens the tab.
  useEffect(() => {
    if (tab === "usage" && allowed) loadUsage();
  }, [tab, allowed]);

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
    loadTokens();
  }

  async function loadTokens() {
    setTokensLoading(true);
    try {
      const res = await fetch("/api/admin/ai-tokens", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        if (data.tokens) setTokens(data.tokens);
        if (data.effective) setEffective(data.effective);
      }
    } finally {
      setTokensLoading(false);
    }
  }

  async function addToken() {
    if (!newKey.trim()) {
      setAiMessage({ kind: "error", text: "Paste a token first." });
      return;
    }
    setTokensBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/admin/ai-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: newLabel.trim() || null,
          anthropic_api_key: newKey.trim(),
          claude_proxy_url: newProxy.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMessage({ kind: "error", text: data.error ?? "Failed to add" });
        return;
      }
      setAiMessage({ kind: "success", text: "Token added. Click Test to verify, then Use to activate it." });
      setNewLabel("");
      setNewKey("");
      setNewProxy("");
      await loadTokens();
    } finally {
      setTokensBusy(false);
    }
  }

  async function activateToken(id: string | null) {
    // Client-side guard: don't activate a row whose last test failed.
    // The server enforces this too, but bailing here gives instant feedback.
    if (id) {
      const row = tokens.find((t) => t.id === id);
      if (row?.last_test_result === "fail") {
        const proceed = confirm(
          `⚠️ This token's last test FAILED.\n\nActivating it now will break AI features for everyone until you fix it.\n\nAre you sure you want to proceed anyway?`
        );
        if (!proceed) return;
        // User explicitly overrode — fall through with force flag.
        return activateTokenForce(id);
      }
    }

    setTokensBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/admin/ai-tokens", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The server runs an auto-test for never-tested tokens — if that
        // fails, the response includes a code so we can show a more helpful
        // message than just the raw error.
        if (data.code === "AUTO_TEST_FAILED") {
          await loadTokens(); // refresh so the failed test status appears in the table
          setAiMessage({
            kind: "error",
            text: `Activation blocked — token didn't work. ${data.error?.replace(/^Auto-test failed before activating: /, "") ?? ""}`,
          });
        } else {
          setAiMessage({ kind: "error", text: data.error ?? "Failed to activate" });
        }
        return;
      }
      setAiMessage({
        kind: "success",
        text: id ? "Active token switched. New requests will use it immediately." : "Using environment variable.",
      });
      await loadTokens();
    } finally {
      setTokensBusy(false);
    }
  }

  // Same as activateToken but tells the server to skip its safety check.
  // Only reachable after the user accepted the warning dialog above.
  async function activateTokenForce(id: string) {
    setTokensBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/admin/ai-tokens", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, force: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMessage({ kind: "error", text: data.error ?? "Failed to activate" });
        return;
      }
      setAiMessage({
        kind: "success",
        text: "Activated despite failed test — AI features may not work until you fix the token.",
      });
      await loadTokens();
    } finally {
      setTokensBusy(false);
    }
  }

  async function testToken(id: string) {
    setTestingId(id);
    setAiMessage(null);
    try {
      const res = await fetch("/api/admin/ai-tokens/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setAiMessage({ kind: "success", text: `Test passed in ${data.latency_ms}ms.` });
      } else {
        setAiMessage({ kind: "error", text: `Test failed: ${data.error ?? "Unknown error"}` });
      }
      await loadTokens();
    } finally {
      setTestingId(null);
    }
  }

  async function deleteToken(t: TokenRow) {
    const label = t.label || t.anthropic_api_key_masked;
    if (!confirm(`Delete token "${label}"?${t.is_active ? " It's the active token — AI features will fall back to the env var until you activate another one." : ""}`)) {
      return;
    }
    setTokensBusy(true);
    setAiMessage(null);
    try {
      const res = await fetch(`/api/admin/ai-tokens?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setAiMessage({ kind: "error", text: data.error ?? "Failed to delete" });
        return;
      }
      setAiMessage({ kind: "success", text: "Token removed." });
      await loadTokens();
    } finally {
      setTokensBusy(false);
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
          <button
            onClick={() => setTab("usage")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "usage"
                ? "border-purple-400 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Activity size={14} /> AI Usage
          </button>
        </div>

        {/* Search — hidden on AI/Usage tabs since there's nothing to search there */}
        {tab !== "ai" && tab !== "usage" && (
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

        {/* AI Settings tab — list of tokens, one is active, all can be tested. */}
        {tab === "ai" && (
          <div className="flex flex-col gap-4">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex items-start gap-2">
              <Key size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Pre-stage AI tokens here. The active one powers every AI feature (Parse Expense, Ask, Recap, Itinerary, Categorize) across <span className="text-white font-semibold">all trips</span>. When a key hits its monthly cap, click <span className="text-emerald-400 font-semibold">Use</span> on another row to flip — no redeploy.
              </p>
            </div>

            {/* Live "what's actually running" banner — proves which source AI routes resolve to. */}
            {effective && (
              <div className={`rounded-xl px-4 py-3 border ${
                effective.source === "db"
                  ? "bg-emerald-950/30 border-emerald-800/50"
                  : "bg-amber-950/30 border-amber-800/50"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    effective.source === "db"
                      ? "bg-emerald-700 text-emerald-100"
                      : "bg-amber-700 text-amber-100"
                  }`}>
                    {effective.source === "db" ? "ACTIVE: DB TOKEN" : "ACTIVE: ENV VAR"}
                  </span>
                  <span className="text-xs text-slate-400">
                    {effective.source === "db"
                      ? "All AI calls now read from the saved token below."
                      : "No DB token activated — AI calls read from Vercel env var."}
                  </span>
                </div>
                <div className="text-xs font-mono text-white break-all">
                  Key: <span className="text-emerald-300">{effective.key_masked}</span>
                </div>
                <div className="text-xs font-mono text-slate-400 break-all">
                  Proxy: {effective.base_url}
                </div>
              </div>
            )}

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

            {/* Token table */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Saved Tokens ({tokens.length})</p>
                <button
                  onClick={loadTokens}
                  disabled={tokensLoading}
                  className="flex items-center gap-1.5 px-2 py-1 bg-slate-700/40 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs rounded-md transition-colors"
                >
                  <RefreshCw size={10} className={tokensLoading ? "animate-spin" : ""} /> Reload
                </button>
              </div>

              {tokens.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-slate-500">
                    {tokensLoading
                      ? "Loading…"
                      : "No tokens saved yet. Add one below. Until then, AI calls use the env var."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900/60 text-slate-500">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">#</th>
                        <th className="text-left font-medium px-3 py-2">Token</th>
                        <th className="text-left font-medium px-3 py-2">Proxy URL</th>
                        <th className="text-left font-medium px-3 py-2">Status</th>
                        <th className="text-left font-medium px-3 py-2">Test</th>
                        <th className="text-left font-medium px-3 py-2">Result</th>
                        <th className="text-left font-medium px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((t, idx) => (
                        <tr key={t.id} className="border-t border-slate-700/40">
                          <td className="px-3 py-2 text-slate-500">{idx + 1}.</td>
                          <td className="px-3 py-2">
                            <div className="font-mono text-white">{t.anthropic_api_key_masked}</div>
                            {t.label && <div className="text-[10px] text-slate-500 mt-0.5">{t.label}</div>}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-300 break-all max-w-[240px]">{t.claude_proxy_url}</td>
                          <td className="px-3 py-2">
                            {t.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 rounded-full">
                                <Check size={10} /> Using
                              </span>
                            ) : (
                              <button
                                onClick={() => activateToken(t.id)}
                                disabled={tokensBusy}
                                title={
                                  t.last_test_result === "fail"
                                    ? "Last test failed — clicking will warn you before activating"
                                    : t.last_test_result === null
                                    ? "Untested — server will auto-test before activating"
                                    : "Activate this token (instant)"
                                }
                                className={`px-2 py-1 disabled:opacity-50 text-white rounded transition-colors ${
                                  t.last_test_result === "fail"
                                    ? "bg-amber-600/80 hover:bg-amber-500"
                                    : "bg-emerald-600/80 hover:bg-emerald-500"
                                }`}
                              >
                                {t.last_test_result === "fail" ? "Use ⚠" : "Use"}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => testToken(t.id)}
                              disabled={testingId === t.id}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700/60 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded transition-colors"
                            >
                              {testingId === t.id ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                              {testingId === t.id ? "Testing…" : "Test"}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            {t.last_test_result === "success" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400" title={t.last_tested_at ? new Date(t.last_tested_at).toLocaleString() : ""}>
                                <Check size={11} /> Success
                                {t.last_test_latency_ms !== null && <span className="text-slate-500 ml-1">{t.last_test_latency_ms}ms</span>}
                              </span>
                            ) : t.last_test_result === "fail" ? (
                              <span
                                className="inline-flex items-center gap-1 text-red-400 cursor-help"
                                title={t.last_test_error ?? "Failed"}
                              >
                                <X size={11} /> Fail
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => deleteToken(t)}
                              disabled={tokensBusy}
                              className="text-red-400 hover:text-red-300 disabled:opacity-50 p-1"
                              title="Delete token"
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tokens.some((t) => t.is_active) && (
                <div className="px-4 py-2 border-t border-slate-700/50 flex justify-end">
                  <button
                    onClick={() => activateToken(null)}
                    disabled={tokensBusy}
                    className="text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-50"
                  >
                    Deactivate all (fall back to env var)
                  </button>
                </div>
              )}
            </div>

            {/* Add token form */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Plus size={14} className="text-emerald-400" />
                <p className="text-sm font-semibold text-white">Add Token</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-slate-500 block mb-1">LABEL (optional)</label>
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Mirbuds account 1"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs rounded-md px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-slate-500 block mb-1">PROXY URL (optional)</label>
                  <input
                    type="text"
                    value={newProxy}
                    onChange={(e) => setNewProxy(e.target.value)}
                    placeholder="https://api.anthropic.com"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs font-mono rounded-md px-3 py-2 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono text-slate-500 block mb-1">TOKEN</label>
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  autoComplete="off"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs font-mono rounded-md px-3 py-2 outline-none"
                />
              </div>
              <button
                onClick={addToken}
                disabled={tokensBusy || !newKey.trim()}
                className="self-start flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-md transition-colors"
              >
                <Save size={12} /> {tokensBusy ? "Saving…" : "Add Token"}
              </button>
              <p className="text-[11px] text-slate-500">
                The token isn&apos;t activated automatically. Click <span className="text-emerald-400">Test</span> first to verify it works, then <span className="text-emerald-400">Use</span> to make it active.
              </p>
            </div>
          </div>
        )}

        {/* ─── AI Usage tab ─────────────────────────────────────────── */}
        {tab === "usage" && (
          <div className="flex flex-col gap-4">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex items-start gap-2">
              <Activity size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Tracks every Claude API call. Token counts come straight from Anthropic&apos;s <span className="font-mono text-slate-300">usage</span> field, so they&apos;re exact. The dollar estimate uses standard Sonnet 4 pricing — if you go through mirbuds AI, real costs may differ.
              </p>
            </div>

            {usageLoading && !usage && (
              <div className="text-center py-12 text-sm text-slate-400">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                Loading usage data…
              </div>
            )}

            {usage && (
              <>
                {/* Top-line cards: current month + all-time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-purple-950/40 to-slate-900 border border-purple-800/40 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={14} className="text-purple-400" />
                      <p className="text-xs uppercase tracking-wider text-slate-400">This month</p>
                    </div>
                    <p className="text-3xl font-bold text-white">{usage.current_month.calls.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 mt-1">calls</p>
                    <div className="mt-3 pt-3 border-t border-slate-800 flex items-baseline justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Tokens</p>
                        <p className="text-sm font-mono text-slate-300">
                          {(usage.current_month.input_tokens + usage.current_month.output_tokens).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Est. cost</p>
                        <p className="text-base font-bold text-emerald-400">${usage.current_month.est_usd.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign size={14} className="text-slate-400" />
                      <p className="text-xs uppercase tracking-wider text-slate-400">All time</p>
                    </div>
                    <p className="text-3xl font-bold text-white">{usage.all_time.calls.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 mt-1">calls</p>
                    <div className="mt-3 pt-3 border-t border-slate-800 flex items-baseline justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Tokens</p>
                        <p className="text-sm font-mono text-slate-300">
                          {(usage.all_time.input_tokens + usage.all_time.output_tokens).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Est. cost</p>
                        <p className="text-base font-bold text-slate-300">${usage.all_time.est_usd.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily chart — last 30 days */}
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Last 30 days</h3>
                  {usage.last_30_days.every((d) => d.calls === 0) ? (
                    <p className="text-xs text-slate-500 text-center py-8">No calls in the last 30 days.</p>
                  ) : (
                    <div style={{ width: "100%", height: 180 }}>
                      <ResponsiveContainer>
                        <AreaChart data={usage.last_30_days} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                          <defs>
                            <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.6} />
                              <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            tick={{ fill: "#64748b", fontSize: 10 }}
                            tickFormatter={(d: string) => d.slice(5)}
                            interval={Math.ceil(usage.last_30_days.length / 6)}
                          />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: "#cbd5e1" }}
                            formatter={(value: unknown, name: unknown) => [Number(value), name === "calls" ? "Calls" : String(name)]}
                          />
                          <Area type="monotone" dataKey="calls" stroke="#a855f7" strokeWidth={2} fill="url(#usageGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Per-route breakdown */}
                <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
                  <h3 className="text-sm font-semibold text-white px-4 pt-4 pb-2">By feature</h3>
                  {usage.by_route.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">No data yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-900/40 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Route</th>
                          <th className="text-right px-4 py-2 font-medium">Calls</th>
                          <th className="text-right px-4 py-2 font-medium">Tokens</th>
                          <th className="text-right px-4 py-2 font-medium">Est. cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {usage.by_route.map((r) => (
                          <tr key={r.route} className="hover:bg-slate-800/40">
                            <td className="px-4 py-2 font-mono text-slate-300">{r.route}</td>
                            <td className="px-4 py-2 text-right text-white font-mono">{r.calls.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-slate-400 font-mono">
                              {(r.input_tokens + r.output_tokens).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right text-emerald-400 font-mono">${r.est_usd.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                  <span>Token counts are exact (from Anthropic). Cost is an estimate.</span>
                  <button
                    onClick={loadUsage}
                    disabled={usageLoading}
                    className="flex items-center gap-1 hover:text-slate-300 disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={usageLoading ? "animate-spin" : ""} /> Refresh
                  </button>
                </div>
              </>
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
