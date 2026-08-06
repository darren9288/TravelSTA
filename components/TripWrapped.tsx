"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Expense, Traveler, Trip } from "@/lib/supabase";
import { buildWrapped, WrappedData, money0, fmtDate } from "@/lib/wrapped";
import { exportCanvas } from "@/lib/share-card";
import { X, Share2, Loader2, RotateCcw } from "lucide-react";
import { haptic, HAPTIC_TAP } from "@/lib/haptics";

const CARD_MS = 4600;

type CardKind = "intro" | "total" | "perDay" | "category" | "biggest" | "podium" | "budget" | "finale";

/** Count from 0 to `value` while its card is on screen. */
function useCountUp(value: number, active: boolean, duration = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) { setN(0); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(value); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Safety net: rAF is throttled or suspended when the tab isn't
    // compositing (backgrounded, low power). Without this the headline
    // number can sit at 0 for the whole card, which reads as a bug.
    const settle = setTimeout(() => setN(value), duration + 100);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [value, active, duration]);
  return n;
}

export default function TripWrapped({
  tripId,
  trip,
  onClose,
}: {
  tripId: string;
  trip: Trip;
  onClose: () => void;
}) {
  const { data: expensesData } = useSWR<Expense[]>(`/api/expenses?trip_id=${tripId}`, fetcher);
  const { data: travelersData } = useSWR<Traveler[]>(`/api/travelers?trip_id=${tripId}`, fetcher);

  const expenses = Array.isArray(expensesData) ? expensesData : null;
  const travelers = Array.isArray(travelersData) ? travelersData : null;
  const loading = !expenses || !travelers;

  const data: WrappedData | null = useMemo(
    () => (expenses && travelers ? buildWrapped(trip, expenses, travelers) : null),
    [trip, expenses, travelers]
  );

  // Only build cards the data can actually fill — an empty card reads as a bug.
  const cards: CardKind[] = useMemo(() => {
    if (!data) return [];
    const c: CardKind[] = ["intro", "total"];
    if (data.byDay.length > 1) c.push("perDay");
    if (data.topCategory) c.push("category");
    if (data.biggest) c.push("biggest");
    if (data.fronted.length > 1) c.push("podium");
    if (data.budget) c.push("budget");
    c.push("finale");
    return c;
  }, [data]);

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const last = cards.length - 1;
  const atEnd = i >= last;

  const next = useCallback(() => setI((v) => Math.min(v + 1, last)), [last]);
  const prev = useCallback(() => setI((v) => Math.max(v - 1, 0)), []);

  // Auto-advance. Stops on the final card so the share button stays put.
  useEffect(() => {
    if (loading || paused || atEnd) return;
    const t = setTimeout(next, CARD_MS);
    return () => clearTimeout(t);
  }, [i, loading, paused, atEnd, next]);

  // Esc closes; arrows navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while the story is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, next, prev]);

  // Press-and-hold pauses (standard story behaviour); a quick tap navigates.
  function pressDown() {
    held.current = false;
    holdTimer.current = setTimeout(() => { held.current = true; setPaused(true); }, 220);
  }
  function pressUp(where: "left" | "right") {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (held.current) { setPaused(false); held.current = false; return; }
    haptic(HAPTIC_TAP);
    if (where === "left") prev(); else next();
  }

  // ── Shareable poster ────────────────────────────────────────────────────
  // Drawn straight onto a canvas rather than rasterising the DOM: no extra
  // dependency, and Tailwind v4's oklch() colours break DOM-rasterisers.
  const drawPoster = useCallback((cv: HTMLCanvasElement, d: WrappedData) => {
    const W = 1080, H = 1350;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, W, H);

    // Accent blooms
    const bloom = (x: number, y: number, r: number, rgb: string, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    bloom(920, 120, 620, "16,185,129", 0.32);
    bloom(120, 1240, 560, "129,140,248", 0.26);

    const F = (px: number, w = "700") =>
      `${w} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

    // Header
    ctx.textAlign = "left";
    ctx.fillStyle = "#94a3b8";
    ctx.font = F(30, "700");
    ctx.fillText((d.dateLabel ?? "").toUpperCase(), 80, 140);

    ctx.fillStyle = "#ffffff";
    ctx.font = F(104, "900");
    ctx.fillText(d.tripName.slice(0, 18), 80, 250);

    if (d.destination) {
      ctx.fillStyle = "#67e8f9";
      ctx.font = F(34, "600");
      ctx.fillText(d.destination.slice(0, 30), 80, 306);
    }

    // Hero total
    ctx.fillStyle = "#64748b";
    ctx.font = F(28, "700");
    ctx.fillText("TOTAL SPENT", 80, 420);
    const grad = ctx.createLinearGradient(80, 440, 80, 540);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#10b981");
    ctx.fillStyle = grad;
    ctx.font = F(120, "900");
    ctx.fillText(`RM ${money0(d.total)}`, 80, 540);

    // Stat tiles
    const tiles: [string, string][] = [
      [String(d.dayCount), "DAYS"],
      [String(d.travelerCount), "TRAVELLERS"],
      [`RM ${money0(d.perDay)}`, "PER DAY"],
      [String(d.expenseCount), "EXPENSES"],
    ];
    const tw = (W - 160 - 3 * 20) / 4;
    tiles.forEach(([v, k], n) => {
      const x = 80 + n * (tw + 20);
      ctx.fillStyle = "rgba(30,41,59,0.72)";
      ctx.beginPath();
      ctx.roundRect(x, 600, tw, 130, 22);
      ctx.fill();
      ctx.strokeStyle = "rgba(148,163,184,0.16)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = F(34, "800");
      ctx.textAlign = "center";
      ctx.fillText(v, x + tw / 2, 665);
      ctx.fillStyle = "#94a3b8";
      ctx.font = F(20, "600");
      ctx.fillText(k, x + tw / 2, 702);
      ctx.textAlign = "left";
    });

    // Who fronted what
    ctx.fillStyle = "#64748b";
    ctx.font = F(26, "700");
    ctx.fillText("WHO PAID", 80, 810);

    const people = d.fronted.slice(0, 5);
    const maxAmt = Math.max(1, ...people.map((p) => p.amount));
    people.forEach((p, n) => {
      const y = 860 + n * 76;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(96, y - 10, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#e2e8f0";
      ctx.font = F(32, "700");
      ctx.fillText(p.name.slice(0, 14), 126, y);

      // bar
      const bx = 320, bw = W - 320 - 300;
      ctx.fillStyle = "rgba(71,85,105,0.45)";
      ctx.beginPath();
      ctx.roundRect(bx, y - 22, bw, 16, 8);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(bx, y - 22, Math.max(12, (p.amount / maxAmt) * bw), 16, 8);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = F(32, "800");
      ctx.textAlign = "right";
      ctx.fillText(`RM ${money0(p.amount)}`, W - 80, y);
      ctx.textAlign = "left";
    });

    // Footer
    ctx.fillStyle = "rgba(148,163,184,0.25)";
    ctx.fillRect(80, H - 130, W - 160, 2);
    ctx.fillStyle = "#475569";
    ctx.font = F(26, "700");
    ctx.fillText("TravelSTA", 80, H - 70);
    ctx.textAlign = "right";
    ctx.fillStyle = "#334155";
    ctx.fillText(trip.join_code ?? "", W - 80, H - 70);
    ctx.textAlign = "left";
  }, [trip.join_code]);

  async function share() {
    if (!data || !canvasRef.current) return;
    setSharing(true);
    setShareMsg("");
    try {
      drawPoster(canvasRef.current, data);
      const r = await exportCanvas(
        canvasRef.current,
        `${data.tripName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-wrapped.png`,
        `${data.tripName} — RM ${money0(data.total)} across ${data.dayCount} days`
      );
      if (r === "downloaded") setShareMsg("Saved to your downloads");
      else if (r === "failed") setShareMsg("Couldn't create the image");
    } finally {
      setSharing(false);
    }
  }

  const kind = cards[i];
  const total = useCountUp(data?.total ?? 0, kind === "total");
  const perDay = useCountUp(data?.perDay ?? 0, kind === "perDay");
  const left = useCountUp(Math.abs(data?.budget?.left ?? 0), kind === "budget");

  return (
    <div className="fixed inset-0 z-[300] bg-slate-950 flex items-center justify-center">
      {/* Off-screen canvas used only to produce the shared PNG. */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {loading || !data ? (
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 size={26} className="animate-spin text-emerald-400" />
          <p className="text-sm">Wrapping your trip…</p>
        </div>
      ) : (
        <div className="relative w-full h-full max-w-md mx-auto overflow-hidden">
          {/* Progress segments */}
          <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 px-3 pt-3 safe-top">
            {cards.map((_, n) => (
              <div key={n} className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
                {n < i ? (
                  <div className="h-full w-full bg-white rounded-full" />
                ) : n === i ? (
                  // Keyed on `i` so the fill animation restarts on each card.
                  // On the last card there's no auto-advance, so show it full.
                  <div
                    key={i}
                    className={`h-full bg-white rounded-full ${atEnd ? "w-full" : "story-fill"}`}
                    style={{
                      ["--story-dur" as string]: `${CARD_MS}ms`,
                      animationPlayState: paused ? "paused" : "running",
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-6 right-3 z-40 p-2 text-white/70 hover:text-white safe-top"
          >
            <X size={22} />
          </button>

          {/* Tap zones */}
          <button
            aria-label="Previous"
            className="absolute inset-y-0 left-0 w-1/3 z-20"
            onPointerDown={pressDown}
            onPointerUp={() => pressUp("left")}
            onPointerLeave={() => { if (holdTimer.current) clearTimeout(holdTimer.current); setPaused(false); }}
          />
          <button
            aria-label="Next"
            className="absolute inset-y-0 right-0 w-2/3 z-20"
            onPointerDown={pressDown}
            onPointerUp={() => pressUp("right")}
            onPointerLeave={() => { if (holdTimer.current) clearTimeout(holdTimer.current); setPaused(false); }}
          />

          {/* Cards */}
          <div key={i} className="absolute inset-0 px-7 flex flex-col justify-center animate-fade-in">
            <Glow kind={kind} />

            {kind === "intro" && (
              <>
                <Kicker>{data.dateLabel}</Kicker>
                <h1 className="text-[15vw] leading-[0.92] font-black text-white tracking-tight">
                  {data.tripName}
                </h1>
                {data.destination && <p className="mt-3 text-lg text-cyan-300">{data.destination}</p>}
                <p className="mt-2 text-sm text-slate-400">
                  {data.travelerCount} travellers · {data.dayCount} days
                </p>
                <p className="mt-8 text-xs tracking-[0.2em] uppercase text-emerald-400 font-bold">
                  your trip, wrapped
                </p>
              </>
            )}

            {kind === "total" && (
              <>
                <Kicker>Together you spent</Kicker>
                <p className="text-[13vw] leading-none font-black text-accent-gradient tabular-nums">
                  RM {money0(total)}
                </p>
                <p className="mt-4 text-sm text-slate-300">
                  across {data.dayCount} days · {data.expenseCount} expenses
                </p>
              </>
            )}

            {kind === "perDay" && (
              <>
                <Kicker>That&apos;s about</Kicker>
                <p className="text-[12vw] leading-none font-black text-white tabular-nums">
                  RM {money0(perDay)}
                </p>
                <p className="mt-3 text-sm text-slate-300">every single day</p>
                <div className="mt-8 flex items-end gap-[3px] h-28">
                  {data.byDay.slice(0, 24).map((d, n) => {
                    const max = Math.max(...data.byDay.map((x) => x.amount), 1);
                    return (
                      <div
                        key={d.date}
                        className="flex-1 rounded-t bg-gradient-to-t from-emerald-500/25 to-emerald-400 animate-grow-y"
                        style={{ height: `${Math.max(6, (d.amount / max) * 100)}%`, animationDelay: `${n * 35}ms` }}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {kind === "category" && data.topCategory && (
              <>
                <Kicker>You spent the most on</Kicker>
                <h2 className="text-[13vw] leading-none font-black text-white">{data.topCategory.name}</h2>
                <p className="mt-4 text-2xl font-bold text-emerald-400 tabular-nums">
                  RM {money0(data.topCategory.amount)}
                </p>
                <p className="mt-1 text-sm text-slate-400 tabular-nums">
                  {data.topCategory.pct.toFixed(0)}% of everything
                </p>
              </>
            )}

            {kind === "biggest" && data.biggest && (
              <>
                <Kicker>Biggest single expense</Kicker>
                <p className="text-[12vw] leading-none font-black text-white tabular-nums">
                  RM {money0(data.biggest.amount)}
                </p>
                <p className="mt-4 text-xl text-slate-200">{data.biggest.category}</p>
                <p className="mt-1 text-sm text-slate-400 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.biggest.color }} />
                  {data.biggest.payer} · {fmtDate(data.biggest.date)}
                </p>
              </>
            )}

            {kind === "podium" && (
              <>
                <Kicker>Who fronted the most</Kicker>
                <h2 className="text-[11vw] leading-none font-black text-amber-400 mb-6">
                  {data.fronted[0]?.name}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {data.fronted.slice(0, 5).map((p, n) => {
                    const max = Math.max(1, data.fronted[0].amount);
                    return (
                      <div key={p.id} className="flex items-center gap-2.5 text-sm">
                        <span className="w-4 text-slate-500 tabular-nums">{n + 1}</span>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-slate-200 w-20 truncate">{p.name}</span>
                        <span className="flex-1 h-2.5 rounded-full bg-slate-700/50 overflow-hidden">
                          <span
                            className="block h-full rounded-full animate-grow-x"
                            style={{ width: `${(p.amount / max) * 100}%`, backgroundColor: p.color, animationDelay: `${n * 90}ms` }}
                          />
                        </span>
                        <span className="text-white font-bold tabular-nums w-20 text-right">
                          RM {money0(p.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {kind === "budget" && data.budget && (
              <>
                <Kicker>And the budget?</Kicker>
                <p
                  className={`text-[12vw] leading-none font-black tabular-nums ${
                    data.budget.left >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  RM {money0(left)}
                </p>
                <p className="mt-3 text-sm text-slate-300">
                  {data.budget.left >= 0 ? "under budget" : "over budget"}
                </p>
                <div className="mt-6 h-2.5 rounded-full bg-slate-700/50 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400 animate-grow-x"
                    style={{ width: `${Math.min(100, data.budget.pct)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500 tabular-nums">
                  RM {money0(data.total)} of RM {money0(data.budget.total)} · {data.budget.pct.toFixed(1)}%
                </p>
              </>
            )}

            {kind === "finale" && (
              <>
                <Kicker>{data.tripName} · wrapped</Kicker>
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <Tile v={`RM ${money0(data.total)}`} k="total" />
                  <Tile v={String(data.dayCount)} k="days" />
                  <Tile v={`RM ${money0(data.perDay)}`} k="per day" />
                  <Tile v={String(data.travelerCount)} k="travellers" />
                </div>
                <div className="flex flex-col gap-1.5 mb-5">
                  {data.fronted.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-slate-300">{p.name}</span>
                      <span className="ml-auto text-white font-semibold tabular-nums">
                        RM {money0(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={share}
                  disabled={sharing}
                  className="relative z-30 w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 cta-glow ripple"
                >
                  {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                  {sharing ? "Making image…" : "Share to group"}
                </button>
                {shareMsg && <p className="mt-2 text-center text-xs text-slate-400">{shareMsg}</p>}
                <button
                  onClick={() => setI(0)}
                  className="relative z-30 mt-3 mx-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
                >
                  <RotateCcw size={12} /> watch again
                </button>
              </>
            )}
          </div>

          {paused && (
            <p className="absolute bottom-6 left-0 right-0 text-center text-[11px] text-white/40 z-30">
              paused
            </p>
          )}
        </div>
      )}

    </div>
  );
}

/** Small uppercase kicker above each card's headline. */
function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] tracking-[0.14em] uppercase text-slate-400 font-bold mb-3">{children}</p>
  );
}

function Tile({ v, k }: { v: string; k: string }) {
  return (
    <div className="glass-card rounded-xl px-3 py-2.5">
      <p className="text-base font-extrabold text-white tabular-nums">{v}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{k}</p>
    </div>
  );
}

/** Per-card accent bloom so consecutive cards don't look identical. */
function Glow({ kind }: { kind: CardKind }) {
  const top = kind === "total" || kind === "biggest" || kind === "finale";
  return (
    <>
      <div
        className="pointer-events-none absolute w-72 h-72 rounded-full blur-[70px] opacity-40"
        style={{
          background: "rgb(var(--accent-rgb))",
          top: top ? "-60px" : "auto",
          bottom: top ? "auto" : "-60px",
          right: top ? "-60px" : "auto",
          left: top ? "auto" : "-60px",
        }}
      />
    </>
  );
}
