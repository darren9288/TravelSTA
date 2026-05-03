"use client";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import { Plane, Hotel, MapPin, Utensils, Train, Tag, ChevronDown, ChevronUp, Plus, Clock } from "lucide-react";
import { useState } from "react";

type Category = "flight" | "hotel" | "activity" | "food" | "transport" | "other";

type Item = {
  id: string;
  time: string;
  title: string;
  category: Category;
  notes: string;
};

type Day = {
  date: string;
  label: string;
  items: Item[];
};

const CATEGORY_CONFIG: Record<Category, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  flight:    { icon: Plane,    color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",   label: "Flight" },
  hotel:     { icon: Hotel,    color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", label: "Hotel" },
  activity:  { icon: MapPin,   color: "text-emerald-400",bg: "bg-emerald-500/10 border-emerald-500/20",label: "Activity" },
  food:      { icon: Utensils, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", label: "Food" },
  transport: { icon: Train,    color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", label: "Transport" },
  other:     { icon: Tag,      color: "text-slate-400",  bg: "bg-slate-500/10 border-slate-500/20",   label: "Other" },
};

// ── Sample data (preview only — will be replaced with real DB data) ──
const SAMPLE_DAYS: Day[] = [
  {
    date: "2025-05-12",
    label: "Day 1 · Mon, 12 May",
    items: [
      { id: "1", time: "08:30", title: "Flight KL → Tokyo (MH070)", category: "flight",    notes: "Terminal 1, Gate C12 · Arrive 16:40 JST" },
      { id: "2", time: "18:00", title: "Check-in: APA Hotel Shinjuku", category: "hotel",    notes: "14F room · Check-out 28 May" },
      { id: "3", time: "20:00", title: "Dinner at Ichiran Ramen",      category: "food",     notes: "Solo booth style · Cash only" },
    ],
  },
  {
    date: "2025-05-13",
    label: "Day 2 · Tue, 13 May",
    items: [
      { id: "4", time: "09:00", title: "Senso-ji Temple, Asakusa",    category: "activity",  notes: "Get there early to avoid crowds" },
      { id: "5", time: "12:30", title: "Lunch at Nakamise Street",     category: "food",     notes: "" },
      { id: "6", time: "15:00", title: "Shibuya Crossing & 109",       category: "activity",  notes: "Shopping time 🛍️" },
      { id: "7", time: "19:30", title: "Team dinner — Yakiniku",       category: "food",     notes: "Reservation under Darren" },
    ],
  },
  {
    date: "2025-05-14",
    label: "Day 3 · Wed, 14 May",
    items: [
      { id: "8",  time: "07:30", title: "Shinkansen to Osaka",         category: "transport", notes: "Nozomi 9 · 2hr 30min" },
      { id: "9",  time: "11:00", title: "Dotonbori food walk",         category: "food",     notes: "Takoyaki, okonomiyaki, crab!" },
      { id: "10", time: "14:00", title: "Osaka Castle",                category: "activity",  notes: "¥600 entry fee" },
    ],
  },
];

export default function ItineraryPage() {
  const { id } = useParams<{ id: string }>();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  function toggleDay(date: string) {
    setCollapsed((prev) => {
      const n = new Set(prev);
      n.has(date) ? n.delete(date) : n.add(date);
      return n;
    });
  }

  return (
    <>
      <Nav tripId={id} tripName="Japan Trip 🇯🇵" />
      <main className="md:ml-56 pb-28 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Itinerary</h1>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors">
              <Plus size={14} /> Add Item
            </button>
          </div>

          {/* Category legend */}
          <div className="flex gap-2 flex-wrap">
            {(Object.entries(CATEGORY_CONFIG) as [Category, typeof CATEGORY_CONFIG[Category]][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${cfg.color} ${cfg.bg}`}>
                  <Icon size={10} /> {cfg.label}
                </div>
              );
            })}
          </div>

          {/* Days */}
          {SAMPLE_DAYS.map((day) => {
            const isCollapsed = collapsed.has(day.date);
            return (
              <div key={day.date} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">

                {/* Day header */}
                <button
                  onClick={() => toggleDay(day.date)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
                      <span className="text-xs font-bold text-emerald-400">
                        {day.label.split("·")[0].replace("Day ", "")}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">{day.label.split("·")[1]?.trim()}</p>
                      <p className="text-xs text-slate-500">{day.items.length} item{day.items.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  {isCollapsed ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronUp size={16} className="text-slate-500" />}
                </button>

                {/* Items */}
                {!isCollapsed && (
                  <div className="flex flex-col divide-y divide-slate-700/40">
                    {day.items.map((item) => {
                      const cfg = CATEGORY_CONFIG[item.category];
                      const Icon = cfg.icon;
                      const isExpanded = expandedItem === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-700/20 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            {/* Time */}
                            <div className="flex flex-col items-center pt-0.5 min-w-[40px]">
                              {item.time ? (
                                <span className="text-xs text-slate-500 font-mono">{item.time}</span>
                              ) : (
                                <Clock size={11} className="text-slate-600" />
                              )}
                            </div>

                            {/* Icon */}
                            <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                              <Icon size={13} className={cfg.color} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white leading-snug">{item.title}</p>
                              {item.notes && isExpanded && (
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.notes}</p>
                              )}
                              {item.notes && !isExpanded && (
                                <p className="text-xs text-slate-600 truncate mt-0.5">{item.notes}</p>
                              )}
                            </div>

                            {/* Category badge */}
                            <span className={`text-xs px-1.5 py-0.5 rounded-md border flex-shrink-0 ${cfg.color} ${cfg.bg}`}>
                              {cfg.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}

                    {/* Add to this day */}
                    <button className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-600 hover:text-emerald-400 transition-colors">
                      <Plus size={13} /> Add to this day
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Preview banner */}
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-400 font-medium">👆 This is a preview with sample data</p>
            <p className="text-xs text-amber-500/70 mt-0.5">Tap items to expand notes · Tap day header to collapse · Tell me if you like this design!</p>
          </div>

        </div>
      </main>
    </>
  );
}
