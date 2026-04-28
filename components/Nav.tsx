"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, PlusCircle, Receipt, BarChart2, Banknote, Settings2, ArrowLeftCircle, Terminal, LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { useEffect, useState } from "react";

type NavProps = { tripId?: string; tripName?: string };

export default function Nav({ tripId, tripName }: NavProps) {
  const path = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        // Username is stored as the part before @travelsta.app
        const name = user.email?.replace("@placeholder.com", "") ?? null;
        setUsername(name);
      }
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!tripId) {
    return (
      <>
        <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 bg-slate-900 border-r border-slate-800 p-4 gap-1 z-50">
          <div className="mb-6 px-2">
            <h1 className="text-xl font-bold text-emerald-400">TravelSTA ✈️</h1>
            <p className="text-xs text-slate-500 mt-0.5">Group Travel Tracker</p>
          </div>
          <Link href="/" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${path === "/" ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
            <Home size={18} /> My Trips
          </Link>
          <div className="mt-auto pt-4 border-t border-slate-800">
            {username && (
              <div className="flex items-center gap-2 px-3 py-2 mb-1">
                <User size={14} className="text-slate-500" />
                <span className="text-xs text-slate-400 font-mono">{username}</span>
              </div>
            )}
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors">
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </nav>
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex z-50">
          <Link href="/" className="flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium text-emerald-400">
            <Home size={20} /> Trips
          </Link>
          <button onClick={handleLogout} className="flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium text-slate-500">
            <LogOut size={20} /> Sign Out
          </button>
        </nav>
      </>
    );
  }

  const links = [
    { href: `/trips/${tripId}`, icon: BarChart2, label: "Dashboard" },
    { href: `/trips/${tripId}/expenses`, icon: Receipt, label: "Expenses" },
    { href: `/trips/${tripId}/add`, icon: PlusCircle, label: "Add" },
    { href: `/trips/${tripId}/settlement`, icon: Banknote, label: "Settle" },
    { href: `/trips/${tripId}/analytics`, icon: BarChart2, label: "Analytics" },
    { href: `/trips/${tripId}/pool`, icon: Banknote, label: "Pool" },
    { href: `/trips/${tripId}/settings`, icon: Settings2, label: "Settings" },
    { href: `/trips/${tripId}/dev`, icon: Terminal, label: "Dev" },
  ];

  const mobileLinks = [
    { href: `/trips/${tripId}`, icon: BarChart2, label: "Home" },
    { href: `/trips/${tripId}/expenses`, icon: Receipt, label: "Expenses" },
    { href: `/trips/${tripId}/add`, icon: PlusCircle, label: "Add" },
    { href: `/trips/${tripId}/settlement`, icon: Banknote, label: "Settle" },
    { href: `/trips/${tripId}/analytics`, icon: BarChart2, label: "Stats" },
  ];

  return (
    <>
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 bg-slate-900 border-r border-slate-800 p-4 gap-1 z-50 overflow-y-auto">
        <div className="mb-4 px-2">
          <Link href="/" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-3 transition-colors">
            <ArrowLeftCircle size={13} /> All Trips
          </Link>
          <h1 className="text-base font-bold text-emerald-400 truncate">{tripName ?? "Trip"}</h1>
          <p className="text-xs text-slate-500 mt-0.5">TravelSTA ✈️</p>
        </div>
        {links.map(({ href, icon: Icon, label }) => {
          const active = path === href;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <Icon size={18} /> {label}
            </Link>
          );
        })}
        <div className="mt-auto pt-4 border-t border-slate-800">
          {username && (
            <div className="flex items-center gap-2 px-3 py-2 mb-1">
              <User size={14} className="text-slate-500" />
              <span className="text-xs text-slate-400 font-mono">{username}</span>
            </div>
          )}
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </nav>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex z-50">
        {mobileLinks.map(({ href, icon: Icon, label }) => {
          const active = path === href;
          return (
            <Link key={href} href={href}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors ${active ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"}`}>
              <Icon size={20} /> {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
