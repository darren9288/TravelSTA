"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type Entry = { id: string; name: string; color: string; amount: number };

export default function TravelerBar({ data }: { data: Entry[] }) {
  // Charts draw themselves in. Skipped entirely under reduced motion, which
  // also guarantees a fully-rendered chart if the animation never runs.
  const reduce = useReducedMotion();

  if (!data.length) return <div className="flex items-center justify-center h-40 text-slate-600 text-sm">No data</div>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          formatter={(v) => [`RM ${Number(v).toFixed(2)}`, "Share"]} />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}
          isAnimationActive={!reduce} animationDuration={700} animationEasing="ease-out">
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
