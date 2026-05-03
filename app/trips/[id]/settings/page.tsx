"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip, Traveler, TRAVELER_COLORS } from "@/lib/supabase";
import { Trash2, Plus, Shield, UserX, ArrowLeftRight, Palette, ImageIcon, Upload, Link } from "lucide-react";
import { useTheme, THEMES } from "@/components/ThemeProvider";

type Member = {
  user_id: string;
  role: "admin" | "editor" | "viewer";
  traveler_id: string | null;
  profiles: { username: string } | null;
};

export default function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Trip fields
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cashRate, setCashRate] = useState("");
  const [wiseRate, setWiseRate] = useState("");

  // New traveler
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TRAVELER_COLORS[0]);

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);

  // Appearance
  const { theme, setTheme } = useTheme();
  const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [tripRes, travelerRes, membersRes] = await Promise.all([
        fetch(`/api/trips/${id}`).then((r) => r.json()),
        fetch(`/api/travelers?trip_id=${id}`).then((r) => r.json()),
        fetch(`/api/members?trip_id=${id}`).then((r) => r.json()),
      ]);
      if (tripRes.error) return;
      setTrip(tripRes);
      setName(tripRes.name);
      setDestination(tripRes.destination ?? "");
      setStartDate(tripRes.start_date ?? "");
      setEndDate(tripRes.end_date ?? "");
      setCashRate(String(tripRes.cash_rate));
      setWiseRate(String(tripRes.wise_rate));
      setBackgroundImageUrl(tripRes.background_image_url ?? "");
      setTravelers(Array.isArray(travelerRes) ? travelerRes : []);
      if (!membersRes.error) {
        setMembers(membersRes.members ?? []);
        setMyRole(membersRes.my_role ?? null);
      }
    }
    load();
  }, [id]);

  async function saveTrip() {
    setSaving(true);
    setError(""); setSuccess("");
    const res = await fetch(`/api/trips/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, destination,
        start_date: startDate || null,
        end_date: endDate || null,
        cash_rate: parseFloat(cashRate) || 1,
        wise_rate: parseFloat(wiseRate) || 1,
        background_image_url: backgroundImageUrl.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); } else { setSuccess("Saved!"); setTrip(data); }
    setSaving(false);
  }

  async function addTraveler() {
    if (!newName.trim()) return;
    const res = await fetch("/api/travelers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ name: newName.trim(), color: newColor, trip_id: id, is_pool: false }]),
    });
    const data = await res.json();
    if (res.ok) {
      setTravelers((prev) => [...prev, ...(Array.isArray(data) ? data : [data])]);
      setNewName("");
    }
  }

  async function changeRole(user_id: string, role: string) {
    await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: id, user_id, role }),
    });
    setMembers((prev) => prev.map((m) => m.user_id === user_id ? { ...m, role: role as Member["role"] } : m));
  }

  async function removeMember(user_id: string) {
    if (!confirm("Remove this member from the trip?")) return;
    const res = await fetch("/api/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: id, user_id }),
    });
    if (res.ok) setMembers((prev) => prev.filter((m) => m.user_id !== user_id));
  }

  async function deleteTrip() {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    await fetch(`/api/trips/${id}`, { method: "DELETE" });
    router.push("/");
  }

  async function uploadBackground(file: File) {
    if (file.size > 8 * 1024 * 1024) { setUploadError("Image must be under 8 MB."); return; }
    setUploading(true); setUploadError("");
    const form = new FormData();
    form.append("file", file);
    form.append("trip_id", id);
    const res = await fetch("/api/upload-background", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) { setUploadError(data.error ?? "Upload failed"); }
    else {
      setBackgroundImageUrl(data.url);
      // Save immediately so the layout picks it up
      await fetch(`/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background_image_url: data.url }),
      });
    }
    setUploading(false);
  }

  if (!trip) return null;

  const realTravelers = travelers.filter((t) => !t.is_pool);
  const pools = travelers.filter((t) => t.is_pool);

  return (
    <>
      <Nav tripId={id} tripName={trip.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
          <h1 className="text-xl font-bold text-white">Settings</h1>

          {/* Trip details */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">Trip Details</h2>
            <div><label className="text-xs text-slate-400 mb-1 block">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} readOnly={myRole === "viewer"}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 read-only:opacity-60 read-only:cursor-default" /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Destination</label>
              <input value={destination} onChange={(e) => setDestination(e.target.value)} readOnly={myRole === "viewer"}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 read-only:opacity-60 read-only:cursor-default" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} readOnly={myRole === "viewer"}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 read-only:opacity-60 read-only:cursor-default" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} readOnly={myRole === "viewer"}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 read-only:opacity-60 read-only:cursor-default" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Cash Rate (1 MYR = ? {trip.foreign_currency})</label>
                <input type="number" value={cashRate} onChange={(e) => setCashRate(e.target.value)} step="0.01" readOnly={myRole === "viewer"}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 read-only:opacity-60 read-only:cursor-default" /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Wise Rate (1 MYR = ? {trip.foreign_currency})</label>
                <input type="number" value={wiseRate} onChange={(e) => setWiseRate(e.target.value)} step="0.01" readOnly={myRole === "viewer"}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 read-only:opacity-60 read-only:cursor-default" /></div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {success && <p className="text-sm text-emerald-400">{success}</p>}
            {myRole !== "viewer" && (
              <button onClick={saveTrip} disabled={saving}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>

          {/* Join code */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-white mb-2">Join Code</h2>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-emerald-400 font-mono tracking-widest">{trip.join_code}</span>
              <p className="text-xs text-slate-500">Share this with travelers to let them join</p>
            </div>
          </div>

          {/* Appearance — theme picker, available to everyone */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Palette size={14} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Appearance</h2>
              <span className="text-xs text-slate-500 ml-auto">Saved on this device</span>
            </div>
            <p className="text-xs text-slate-500">Pick an accent color for the app.</p>
            <div className="flex gap-3 flex-wrap">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  title={t.label}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <div
                    className="w-8 h-8 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: t.color,
                      borderColor: theme === t.key ? "white" : "transparent",
                      boxShadow: theme === t.key ? `0 0 0 2px ${t.color}` : "none",
                    }}
                  />
                  <span className={`text-xs transition-colors ${theme === t.key ? "text-white" : "text-slate-500 group-hover:text-slate-300"}`}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Background Image — editor/admin only */}
          {myRole !== "viewer" && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <ImageIcon size={14} className="text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Background Image</h2>
              </div>

              {/* Current preview */}
              {backgroundImageUrl.trim() ? (
                <div className="relative rounded-xl overflow-hidden h-32 border border-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={backgroundImageUrl.trim()}
                    alt="Background preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-slate-950/40 flex items-end p-2 gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-white text-xs rounded-lg transition-colors"
                    >
                      <Upload size={12} /> Change
                    </button>
                    <button
                      onClick={async () => {
                        setBackgroundImageUrl("");
                        await fetch(`/api/trips/${id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ background_image_url: null }),
                        });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/60 hover:bg-red-800/80 text-red-300 text-xs rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Upload button — primary */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 w-full py-8 border-2 border-dashed border-slate-600 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Upload size={20} />
                    <span className="text-sm font-medium">
                      {uploading ? "Uploading…" : "Upload photo from device"}
                    </span>
                  </button>

                  {/* URL option — secondary */}
                  <button
                    onClick={() => setShowUrlInput((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <Link size={11} /> Or paste an image URL
                  </button>
                  {showUrlInput && (
                    <div className="flex gap-2">
                      <input
                        value={backgroundImageUrl}
                        onChange={(e) => setBackgroundImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={saveTrip}
                        disabled={saving}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              )}

              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadBackground(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Import/Export */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ArrowLeftRight size={14} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Import / Export</h2>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Export your transactions to CSV or JSON, or import transactions from a file.
            </p>
            <button
              onClick={() => router.push(`/trips/${id}/import-export`)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Go to Import/Export
            </button>
          </div>

          {/* Members — admin only */}
          {myRole === "admin" && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Members</h2>
              </div>
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3">
                  <span className="text-sm text-white flex-1 font-mono">
                    {m.profiles?.username ?? "unknown"}
                  </span>
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.user_id, e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button onClick={() => removeMember(m.user_id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                    <UserX size={14} />
                  </button>
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-xs text-slate-500">No members yet.</p>
              )}
            </div>
          )}

          {/* Travelers */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white">Travelers</h2>
            {realTravelers.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-sm text-white flex-1">{t.name}</span>
              </div>
            ))}
            {/* Add traveler — editors/admins only */}
            {myRole !== "viewer" && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex gap-1 flex-wrap">
                  {TRAVELER_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setNewColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-all"
                      style={{ backgroundColor: c, borderColor: newColor === c ? "white" : "transparent" }} />
                  ))}
                </div>
                <input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="New traveler name"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                <button onClick={addTraveler} disabled={!newName.trim()}
                  className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors">
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Pools */}
          {pools.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-white">Pools</h2>
              {pools.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm text-white flex-1">{p.name}</span>
                  <span className="text-xs text-slate-500">{p.pool_currency}</span>
                </div>
              ))}
            </div>
          )}

          {/* Danger zone — admin only */}
          {myRole === "admin" && (
            <div className="border border-red-900/50 rounded-2xl p-4">
              <h2 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h2>
              <p className="text-xs text-slate-500 mb-3">Permanently delete this trip and all its data.</p>
              <button onClick={deleteTrip}
                className="flex items-center gap-2 px-4 py-2 bg-red-900/30 border border-red-800/50 hover:bg-red-900/50 text-red-400 text-sm rounded-lg transition-colors">
                <Trash2 size={14} /> Delete Trip
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
