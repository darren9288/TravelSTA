import { Traveler } from "@/lib/supabase";

export default function TravelerBadge({ traveler, size = "sm" }: { traveler: Traveler; size?: "sm" | "md" }) {
  const pad = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${pad}`}
      style={{ backgroundColor: traveler.color + "22", color: traveler.color, border: `1px solid ${traveler.color}44` }}
    >
      {traveler.is_pool ? "💰 " : ""}{traveler.name}
    </span>
  );
}
