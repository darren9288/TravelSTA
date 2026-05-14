"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Plane, Eye, EyeOff, ArrowLeftCircle, KeyRound, User, Shield } from "lucide-react";
import Link from "next/link";
import NotificationToggle from "@/components/NotificationToggle";

export default function AccountPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Change password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setEmail(user.email ?? "");
      setUsername(user.email?.replace("@placeholder.com", "") ?? "");
      // Check super admin via API
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setIsSuperAdmin(Boolean(data.is_super_admin));
      }
      setLoading(false);
    });
  }, [router]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPw.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setError("New passwords do not match.");
      return;
    }
    if (currentPw === newPw) {
      setError("New password must be different from the current one.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Step 1: re-verify the current password by signing in again.
    // Supabase keeps the same session; this is just an auth check.
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPw,
    });
    if (verifyErr) {
      setError("Current password is wrong.");
      setSaving(false);
      return;
    }

    // Step 2: update to new password.
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    setSuccess("Password updated.");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setSaving(false);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6">
      <div className="max-w-lg mx-auto flex flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors w-fit"
        >
          <ArrowLeftCircle size={13} /> Back
        </Link>

        <div className="flex items-center gap-2">
          <Plane size={20} className="text-emerald-400" />
          <h1 className="text-xl font-bold text-white">My Account</h1>
        </div>

        {/* Profile */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <User size={14} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Profile</h2>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Username</label>
            <input
              value={username}
              readOnly
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono opacity-70"
            />
            <p className="text-xs text-slate-600 mt-1">Username cannot be changed.</p>
          </div>
          {isSuperAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl transition-colors w-fit"
            >
              <Shield size={14} /> Open Admin Panel
            </Link>
          )}
        </div>

        {/* Push notifications */}
        <NotificationToggle />

        {/* Change password */}
        <form
          onSubmit={changePassword}
          className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Change Password</h2>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Current Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">New Password</label>
            <input
              type={showPw ? "text" : "password"}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              placeholder="Min 6 characters"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Confirm New Password</label>
            <input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-emerald-400">{success}</p>}

          <button
            type="submit"
            disabled={saving || !currentPw || !newPw || !confirmPw}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {saving ? "Updating…" : "Update Password"}
          </button>

          <p className="text-xs text-slate-600 text-center">
            Forgot your password? Ask the admin to reset it for you.
          </p>
        </form>

        <button
          onClick={handleSignOut}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
