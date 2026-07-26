"use client";

// Route-level error fallback for trip pages — keeps the app chrome (unlike
// global-error) and offers a retry. Client render fallback only; no data impact.
export default function TripError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xs text-center flex flex-col gap-4">
        <div className="text-5xl">😵‍💫</div>
        <h1 className="text-lg font-bold text-white">This page hit a snag</h1>
        <p className="text-sm text-slate-400">Something went wrong here. Your data is safe.</p>
        <button onClick={() => reset()} className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors">
          Try again
        </button>
        <a href="/" className="text-xs text-slate-500 hover:text-slate-300">← Back to trips</a>
      </div>
    </div>
  );
}
