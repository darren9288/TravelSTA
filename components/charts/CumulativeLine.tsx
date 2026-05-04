"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

type Entry = { date: string; amount: number };

export default function CumulativeLine({ data }: { data: Entry[] }) {
  if (!data.length) return <div className="flex items-center justify-center h-40 text-slate-600 text-sm">No data</div>;

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const chartData = sorted.map((d) => {
    running += d.amount;
    return {
      label: new Date(d.date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" }),
      daily: d.amount,
      total: parseFloat(running.toFixed(2)),
    };
  });

  const max = chartData[chartData.length - 1]?.total ?? 0;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          formatter={(v: unknown, name: unknown) => [
            `RM ${Number(v).toFixed(2)}`,
            name === "total" ? "Cumulative" : "That day",
          ]}
        />
        <ReferenceLine y={max} stroke="#334155" strokeDasharray="4 4" label={{ value: `RM ${max.toFixed(0)}`, fill: "#64748b", fontSize: 10, position: "insideTopRight" }} />
        <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
        <Line type="monotone" dataKey="daily" stroke="#334155" strokeWidth={1} dot={false} strokeDasharray="3 3" activeDot={{ r: 3, fill: "#94a3b8" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
