"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#6366f1","#3b82f6","#22c55e","#f97316","#ec4899","#eab308","#14b8a6","#a855f7","#64748b","#ef4444","#84cc16","#f43f5e"];

type Entry = { name: string; amount: number };

export default function CategoryPie({ data }: { data: Entry[] }) {
  if (!data.length) return <div className="flex items-center justify-center h-40 text-slate-600 text-sm">No data</div>;
  const sorted = [...data].sort((a, b) => b.amount - a.amount);
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={sorted} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="amount" paddingAngle={2}>
            {sorted.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            formatter={(v) => [`RM ${Number(v).toFixed(2)}`, ""]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
        {sorted.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1 text-xs text-slate-400">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
