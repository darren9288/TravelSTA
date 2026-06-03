"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Plane, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

// Wrap the form in <Suspense> so useSearchParams doesn't bail out of
// static rendering at build time.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginForm />
    </Suspense>
  );
}

// Only redirect to internal paths so a malicious ?next=https://evil.com
// link can't bounce users off the app post-login.
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read ?next from both the Next.js search params hook AND raw
  // window.location as a defensive belt — useSearchParams has occasionally
  // returned null on first paint when the page was served from the
  // service worker cache. Either source giving a valid path is fine.
  const fromHook = searchParams.get("next");
  const fromLocation = typeof window !== "undefined"
    ? new URL(window.location.href).searchParams.get("next")
    : null;
  const next = safeNext(fromHook ?? fromLocation);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: `${username.trim().toLowerCase()}@placeholder.com`,
      password,
    });

    if (error) {
      setError("Wrong username or password.");
      setLoading(false);
      return;
    }

    // Hard redirect (not router.push) so:
    //   1. Supabase's auth cookies fully propagate via browser cookie jar
    //   2. Middleware on the next request sees the authenticated session
    //   3. Any cached client-side state from before login is dropped
    // router.push + router.refresh had a race where the next page loaded
    // before cookies were ready, landing the user on / instead of `next`.
    void router; // keep import used; explicit no-op
    window.location.href = next;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Plane size={28} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">TravelSTA</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. darren"
              autoComplete="username"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button type="submit" disabled={loading || !username.trim() || !password}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors">
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          No account?{" "}
          <Link
            href={next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="text-emerald-400 hover:text-emerald-300 font-medium"
          >
            Sign up
          </Link>
        </p>
        <p className="text-center text-xs text-slate-600 mt-3">
          Forgot password? Ask the admin to reset it for you.
        </p>
      </div>
    </div>
  );
}
