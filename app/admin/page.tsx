"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield, ArrowLeftCircle, Trash2, KeyRound, Users, Plane,
  Search, AlertTriangle, Crown,
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

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"users" | "trips">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [trips, setTrips] = useState<AdminTrip[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Reset password modal state
  const [resetForUser, setResetForUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

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
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "users" ? "Search users…" : "Search trips…"}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
          />
        </div>

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
