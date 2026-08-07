import { Traveler } from "@/lib/supabase";
import { initial } from "@/lib/categories";

export default function TravelerBadge({ traveler, size = "sm" }: { traveler: Traveler; size?: "sm" | "md" }) {
  const pad = size === "md" ? "pl-1 pr-3 py-1 text-sm gap-1.5" : "pl-0.5 pr-2 py-0.5 text-xs gap-1";
  const dot = size === "md" ? "w-5 h-5 text-[10px]" : "w-4 h-4 text-[9px]";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${pad}`}
      style={{ backgroundColor: traveler.color + "22", color: traveler.color, border: `1px solid ${traveler.color}44` }}
    >
      {/* Monogram instead of a bare dot — tells you who paid at a glance,
          and stays legible where several travellers share a similar colour. */}
      <span
        className={`${dot} rounded-full flex items-center justify-center font-extrabold flex-shrink-0`}
        style={{ backgroundColor: traveler.color, color: "#0b1120" }}
        aria-hidden="true"
      >
        {traveler.is_pool ? "$" : initial(traveler.name)}
      </span>
      {traveler.name}
    </span>
  );
}
