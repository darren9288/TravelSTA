"use client";
import { useEffect, useRef } from "react";

// Dependency-free canvas confetti burst. Mount it to fire once; it calls onDone
// when the animation finishes so the parent can unmount it. Respects reduce-motion.
export default function Confetti({ onDone }: { onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const finish = () => doneRef.current?.();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (reduce || !canvas || !ctx) { finish(); return; }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = (canvas.width = Math.floor(window.innerWidth * dpr));
    const H = (canvas.height = Math.floor(window.innerHeight * dpr));
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    const colors = ["#10b981", "#34d399", "#6ee7b7", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa"];
    const N = 150;
    const parts = Array.from({ length: N }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.4,
      y: H * 0.32,
      vx: (Math.random() - 0.5) * 13 * dpr,
      vy: (Math.random() * -1.1 - 0.5) * 14 * dpr,
      g: 0.35 * dpr,
      size: (4 + Math.random() * 5) * dpr,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
    }));

    const TOTAL = 130;
    let t = 0;
    let raf = 0;
    const tick = () => {
      t++;
      ctx.clearRect(0, 0, W, H);
      const alpha = Math.max(0, 1 - t / TOTAL);
      for (const p of parts) {
        p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (t < TOTAL) raf = requestAnimationFrame(tick);
      else { ctx.clearRect(0, 0, W, H); finish(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="fixed inset-0 z-[100] pointer-events-none" aria-hidden="true" />;
}
