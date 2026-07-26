"use client";

// Catches render errors that escape the root layout (otherwise a blank white
// screen). Must render its own <html>/<body>. Your data is never affected — this
// is a client render fallback only.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }} className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-xs text-center flex flex-col gap-4">
          <div className="text-5xl">😵‍💫</div>
          <h1 className="text-lg font-bold">Something broke</h1>
          <p className="text-sm text-slate-400">The app hit an unexpected error. Your trip data is safe — just try again.</p>
          <button onClick={() => reset()} className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors">
            Try again
          </button>
          <a href="/" className="text-xs text-slate-500 hover:text-slate-300">← Back to trips</a>
        </div>
      </body>
    </html>
  );
}
