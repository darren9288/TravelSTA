import { Trip } from "@/lib/supabase";
import Link from "next/link";
import { MapPin, Calendar, Users } from "lucide-react";

type Props = { trip: Trip; travelerCount?: number; total?: number };

export default function TripCard({ trip, travelerCount, total }: Props) {
  const start = trip.start_date ? new Date(trip.start_date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : null;
  const end = trip.end_date ? new Date(trip.end_date + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : null;

  return (
    <Link href={`/trips/${trip.id}`}>
      <div className="bg-slate-800/60 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-4 transition-all hover:bg-slate-800 cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-bold text-white text-lg">{trip.name}</h3>
            {trip.destination && (
              <div className="flex items-center gap-1 text-slate-400 text-xs mt-0.5">
                <MapPin size={11} /> {trip.destination}
              </div>
            )}
          </div>
          <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
            {trip.join_code}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 mt-3">
          {(start || end) && (
            <div className="flex items-center gap-1">
              <Calendar size={11} />
              {start}{end && start !== end ? ` – ${end}` : ""}
            </div>
          )}
          {travelerCount !== undefined && (
            <div className="flex items-center gap-1">
              <Users size={11} /> {travelerCount} travelers
            </div>
          )}
          {total !== undefined && (
            <div className="ml-auto font-semibold text-white">
              RM {total.toFixed(2)}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
