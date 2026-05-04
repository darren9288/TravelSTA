"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "@/components/Nav";
import {
  Plane, Hotel, MapPin, Utensils, Train, Tag,
  ChevronDown, ChevronUp, Plus, Clock, ArrowLeft,
  Upload, Link2, FileText, ImageIcon, Trash2,
  ExternalLink, X, Check, Pencil, File, FileImage,
} from "lucide-react";

type Category = "flight" | "hotel" | "activity" | "food" | "transport" | "other";
type ItineraryLink = { id: string; item_id: string; label: string | null; url: string };
type ItineraryFile = { id: string; item_id: string; name: string; url: string; mime_type: string | null };
type ItineraryItem = {
  id: string; trip_id: string; date: string; time: string | null; end_time: string | null;
  title: string; category: Category; notes: string | null; photo_url: string | null;
  links: ItineraryLink[]; files: ItineraryFile[];
};

const CAT: Record<Category, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  flight:    { icon: Plane,    color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",    label: "Flight" },
  hotel:     { icon: Hotel,    color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", label: "Hotel" },
  activity:  { icon: MapPin,   color: "text-emerald-400",bg: "bg-emerald-500/10 border-emerald-500/20",label: "Activity" },
  food:      { icon: Utensils, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", label: "Food" },
  transport: { icon: Train,    color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", label: "Transport" },
  other:     { icon: Tag,      color: "text-slate-400",  bg: "bg-slate-500/10 border-slate-500/20",   label: "Other" },
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
}

function groupByDay(items: ItineraryItem[]) {
  const map: Record<string, ItineraryItem[]> = {};
  for (const item of items) {
    if (!map[item.date]) map[item.date] = [];
    map[item.date].push(item);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

export default function ItineraryPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<{ name: string; start_date: string | null; my_role: string | null } | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10));
  const [addTime, setAddTime] = useState("");
  const [addEndTime, setAddEndTime] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addCat, setAddCat] = useState<Category>("activity");
  const [adding, setAdding] = useState(false);

  // Inline time edit in detail panel
  const [editingTimes, setEditingTimes] = useState(false);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [savingTimes, setSavingTimes] = useState(false);

  // Notes edit
  const [editNotes, setEditNotes] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Links
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  // Category filter
  const [filterCat, setFilterCat] = useState<Category | "all">("all");

  // Files / photo
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const isViewer = trip?.my_role === "viewer";

  const load = useCallback(async () => {
    setLoading(true);
    const [tripRes, itemsRes] = await Promise.all([
      fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/itinerary?trip_id=${id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    setTrip(tripRes.error ? null : { name: tripRes.name, start_date: tripRes.start_date, my_role: tripRes.my_role });
    setItems(Array.isArray(itemsRes) ? itemsRes : []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-scroll to today if a matching day exists
  useEffect(() => {
    if (items.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const hasToday = items.some((i) => i.date === today);
    if (hasToday) {
      setTimeout(() => {
        document.getElementById(`day-${today}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, [items]);

  useEffect(() => {
    if (selectedItem) {
      setNotesVal(selectedItem.notes ?? "");
      setEditNotes(false);
      setEditingTimes(false);
      setShowAddLink(false);
      setUploadError("");
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(updated: ItineraryItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function addItem() {
    if (!addTitle.trim()) return;
    setAdding(true);
    const res = await fetch("/api/itinerary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: id, date: addDate, time: addTime || null, end_time: addEndTime || null, title: addTitle.trim(), category: addCat }),
    });
    if (res.ok) {
      const item = await res.json();
      setItems((prev) =>
        [...prev, item].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
      );
      setAddTitle(""); setAddTime(""); setAddEndTime(""); setShowAdd(false);
      setSelectedId(item.id);
    }
    setAdding(false);
  }

  async function deleteItem(itemId: string) {
    if (!confirm("Delete this item and all its attachments?")) return;
    await fetch("/api/itinerary", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, trip_id: id }),
    });
    if (selectedId === itemId) setSelectedId(null);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function saveNotes() {
    if (!selectedItem) return;
    setSavingNotes(true);
    await fetch("/api/itinerary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...selectedItem, trip_id: id, notes: notesVal }),
    });
    patch({ ...selectedItem, notes: notesVal });
    setEditNotes(false);
    setSavingNotes(false);
  }

  async function saveTimes() {
    if (!selectedItem) return;
    setSavingTimes(true);
    await fetch("/api/itinerary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...selectedItem, trip_id: id, time: editStartTime || null, end_time: editEndTime || null }),
    });
    patch({ ...selectedItem, time: editStartTime || null, end_time: editEndTime || null });
    setEditingTimes(false);
    setSavingTimes(false);
  }

  async function addLink() {
    if (!linkUrl.trim() || !selectedItem) return;
    setAddingLink(true);
    const res = await fetch("/api/itinerary/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: selectedItem.id, label: linkLabel.trim() || null, url: linkUrl.trim() }),
    });
    if (res.ok) {
      const link = await res.json();
      patch({ ...selectedItem, links: [...selectedItem.links, link] });
      setLinkLabel(""); setLinkUrl(""); setShowAddLink(false);
    }
    setAddingLink(false);
  }

  async function removeLink(linkId: string) {
    if (!selectedItem) return;
    await fetch("/api/itinerary/links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: linkId }),
    });
    patch({ ...selectedItem, links: selectedItem.links.filter((l) => l.id !== linkId) });
  }

  async function uploadPhoto(file: File) {
    if (!selectedItem) return;
    setUploadingPhoto(true); setUploadError("");
    const form = new FormData();
    form.append("file", file); form.append("item_id", selectedItem.id);
    form.append("trip_id", id); form.append("type", "photo");
    const res = await fetch("/api/itinerary/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) { setUploadError(data.error); }
    else {
      await fetch("/api/itinerary", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selectedItem, trip_id: id, photo_url: data.url }),
      });
      patch({ ...selectedItem, photo_url: data.url });
    }
    setUploadingPhoto(false);
  }

  async function uploadFile(file: File) {
    if (!selectedItem) return;
    setUploadingFile(true); setUploadError("");
    const form = new FormData();
    form.append("file", file); form.append("item_id", selectedItem.id);
    form.append("trip_id", id); form.append("type", "file");
    const res = await fetch("/api/itinerary/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) { setUploadError(data.error); }
    else {
      const fileRes = await fetch("/api/itinerary/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: selectedItem.id, name: data.name, url: data.url, mime_type: data.mime_type }),
      });
      if (fileRes.ok) {
        const fileRecord = await fileRes.json();
        patch({ ...selectedItem, files: [...selectedItem.files, fileRecord] });
      }
    }
    setUploadingFile(false);
  }

  async function removeFile(fileId: string) {
    if (!selectedItem) return;
    await fetch("/api/itinerary/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fileId }),
    });
    patch({ ...selectedItem, files: selectedItem.files.filter((f) => f.id !== fileId) });
  }

  const days = groupByDay(items);

  const filteredDays = groupByDay(
    filterCat === "all" ? items : items.filter((i) => i.category === filterCat)
  );

  return (
    <>
      <Nav tripId={id} tripName={trip?.name} />
      <main className="md:ml-56 pb-28 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Itinerary</h1>
            {!isViewer && (
              <button onClick={() => setShowAdd((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors">
                <Plus size={14} /> Add Item
              </button>
            )}
          </div>

          {/* Category filter pills */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCat("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${filterCat === "all" ? "text-white bg-slate-700 border-slate-500" : "text-slate-500 border-slate-700 hover:text-slate-300"}`}>
              All
            </button>
            {(Object.entries(CAT) as [Category, typeof CAT[Category]][]).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button key={key} onClick={() => setFilterCat(filterCat === key ? "all" : key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${filterCat === key ? `${cfg.color} ${cfg.bg}` : "text-slate-500 border-slate-700 hover:text-slate-300"}`}>
                  <Icon size={12} /> {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Add form */}
          {showAdd && !isViewer && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-white">New Item</h2>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Date</label>
                  <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Start <span className="text-slate-600">opt</span></label>
                  <input type="time" value={addTime} onChange={(e) => setAddTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">End <span className="text-slate-600">opt</span></label>
                  <input type="time" value={addEndTime} onChange={(e) => setAddEndTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500" /></div>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Title</label>
                <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="e.g. Flight KL → Tokyo"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" /></div>
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Category</label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(CAT) as [Category, typeof CAT[Category]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button key={key} onClick={() => setAddCat(key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${addCat === key ? `${cfg.color} ${cfg.bg}` : "text-slate-500 border-slate-700 hover:text-slate-300"}`}>
                        <Icon size={12} /> {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-slate-600 text-slate-400 text-sm rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={addItem} disabled={adding || !addTitle.trim()}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {adding ? "Adding…" : "Add Item"}
                </button>
              </div>
            </div>
          )}

          {/* Two-panel layout */}
          <div className={`flex gap-4 ${selectedId ? "md:items-start" : ""}`}>

            {/* Day list */}
            <div className={`flex-col gap-3 ${selectedId ? "hidden md:flex md:w-2/5 md:min-w-0" : "flex w-full"}`}>
              {loading ? (
                [1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-800 rounded-2xl animate-pulse" />)
              ) : filteredDays.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-5xl mb-3">🗓️</p>
                  <p className="text-slate-500 text-sm">No itinerary yet.</p>
                  {!isViewer && <p className="text-slate-600 text-xs mt-1">Tap &quot;Add Item&quot; to start planning!</p>}
                </div>
              ) : filteredDays.map(([date, dayItems]) => {
                const isCollapsed = collapsed.has(date);
                const startDate = trip?.start_date;
                const dayNum = startDate
                  ? Math.round((new Date(date + "T00:00:00").getTime() - new Date(startDate + "T00:00:00").getTime()) / 86400000) + 1
                  : null;

                return (
                  <div key={date} id={`day-${date}`} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
                    {/* Day header */}
                    <button onClick={() => setCollapsed((prev) => { const n = new Set(prev); n.has(date) ? n.delete(date) : n.add(date); return n; })}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-emerald-400">{dayNum ?? date.slice(8)}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-white">{fmtDate(date)}</p>
                          <p className="text-xs text-slate-500">{dayItems.length} item{dayItems.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      {isCollapsed ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronUp size={16} className="text-slate-500" />}
                    </button>

                    {!isCollapsed && (
                      <div className="flex flex-col divide-y divide-slate-700/40">
                        {dayItems.map((item) => {
                          const cfg = CAT[item.category];
                          const Icon = cfg.icon;
                          const isSelected = selectedId === item.id;
                          const timeParts = item.time ? item.time.slice(0, 5) : null;
                          return (
                            <button key={item.id} onClick={() => setSelectedId(isSelected ? null : item.id)}
                              className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? "bg-slate-700/40" : "hover:bg-slate-700/20"}`}>
                              <div className="flex items-center gap-3">
                                {/* Time column — fixed width */}
                                <span className="w-10 text-xs font-mono text-slate-500 flex-shrink-0 text-right leading-tight">
                                  {timeParts ?? ""}
                                </span>
                                {/* Category icon */}
                                <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                                  <Icon size={14} className={cfg.color} />
                                </div>
                                {/* Title + subtitle */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                                  {item.notes && (
                                    <p className="text-xs text-slate-500 truncate mt-0.5">{item.notes}</p>
                                  )}
                                </div>
                                {/* Category badge */}
                                <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.color} ${cfg.bg}`}>
                                  {cfg.label}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                        {/* Add to this day */}
                        {!isViewer && (
                          <button
                            onClick={() => { setAddDate(date); setShowAdd(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-slate-600 hover:text-emerald-400 hover:bg-slate-700/20 transition-colors">
                            <Plus size={13} /> Add to this day
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Detail panel */}
            {selectedId && selectedItem && (
              <div className="w-full md:flex-1 md:min-w-0 bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden flex flex-col">

                {/* Panel header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
                  <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
                    <ArrowLeft size={16} />
                  </button>
                  {(() => { const cfg = CAT[selectedItem.category]; const Icon = cfg.icon; return <Icon size={14} className={`${cfg.color} flex-shrink-0`} />; })()}
                  <span className="text-sm font-semibold text-white flex-1 truncate">{selectedItem.title}</span>
                  {!isViewer && (
                    <button onClick={() => deleteItem(selectedItem.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Hero photo */}
                {selectedItem.photo_url ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedItem.photo_url} alt={selectedItem.title} className="w-full h-52 object-cover" />
                    {!isViewer && (
                      <button onClick={() => photoRef.current?.click()} disabled={uploadingPhoto}
                        className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800 text-white text-xs rounded-lg transition-colors">
                        <Upload size={11} /> {uploadingPhoto ? "Uploading…" : "Change"}
                      </button>
                    )}
                  </div>
                ) : !isViewer ? (
                  <button onClick={() => photoRef.current?.click()} disabled={uploadingPhoto}
                    className="mx-4 mt-4 flex items-center justify-center gap-2 py-7 border-2 border-dashed border-slate-600 hover:border-emerald-500 text-slate-500 hover:text-emerald-400 rounded-xl transition-colors disabled:opacity-50">
                    <ImageIcon size={18} />
                    <span className="text-sm">{uploadingPhoto ? "Uploading…" : "Add cover photo"}</span>
                  </button>
                ) : null}
                <input ref={photoRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />

                {/* Meta bar */}
                <div className="px-4 py-2.5 border-b border-slate-700/30">
                  {editingTimes ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock size={12} className="text-slate-500 flex-shrink-0" />
                      <input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)}
                        placeholder="Start"
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 w-28" />
                      <span className="text-slate-600 text-xs">→</span>
                      <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)}
                        placeholder="End"
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 w-28" />
                      <button onClick={saveTimes} disabled={savingTimes}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                        <Check size={11} /> {savingTimes ? "…" : "Save"}
                      </button>
                      <button onClick={() => setEditingTimes(false)}
                        className="p-1 text-slate-500 hover:text-white transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Clock size={12} className="text-slate-500 flex-shrink-0" />
                      <span className="text-xs text-slate-400 flex-1">
                        {fmtDate(selectedItem.date)}
                        {selectedItem.time ? ` · ${selectedItem.time.slice(0, 5)}` : ""}
                        {selectedItem.end_time ? ` – ${selectedItem.end_time.slice(0, 5)}` : ""}
                      </span>
                      {!isViewer && (
                        <button onClick={() => { setEditStartTime(selectedItem.time?.slice(0, 5) ?? ""); setEditEndTime(selectedItem.end_time?.slice(0, 5) ?? ""); setEditingTimes(true); }}
                          className="p-1 text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0">
                          <Pencil size={11} />
                        </button>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${CAT[selectedItem.category].color} ${CAT[selectedItem.category].bg}`}>
                        {CAT[selectedItem.category].label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Scrollable sections */}
                <div className="flex flex-col divide-y divide-slate-700/30 overflow-y-auto max-h-[65vh]">

                  {/* Notes */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</span>
                      {!isViewer && !editNotes && (
                        <button onClick={() => setEditNotes(true)} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-300 transition-colors">
                          <Pencil size={11} /> Edit
                        </button>
                      )}
                    </div>
                    {editNotes ? (
                      <div className="flex flex-col gap-2">
                        <textarea value={notesVal} onChange={(e) => setNotesVal(e.target.value)} rows={4}
                          placeholder="Confirmation code, gate number, tips, anything…"
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => { setEditNotes(false); setNotesVal(selectedItem.notes ?? ""); }}
                            className="flex items-center gap-1 px-3 py-1.5 border border-slate-600 text-slate-400 text-xs rounded-lg hover:text-white transition-colors">
                            <X size={11} /> Cancel
                          </button>
                          <button onClick={saveNotes} disabled={savingNotes}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors">
                            <Check size={11} /> {savingNotes ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap min-h-[1.5rem]">
                        {selectedItem.notes || <span className="text-slate-600 italic text-xs">No notes yet{!isViewer ? " — tap Edit to add" : ""}</span>}
                      </p>
                    )}
                  </div>

                  {/* Links */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Links</span>
                      {!isViewer && (
                        <button onClick={() => setShowAddLink((v) => !v)} className="flex items-center gap-1 text-xs text-slate-600 hover:text-emerald-400 transition-colors">
                          <Plus size={11} /> Add
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {selectedItem.links.map((link) => (
                        <div key={link.id} className="flex items-center gap-2">
                          <a href={link.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 bg-slate-900/60 hover:bg-slate-700/60 rounded-lg transition-colors group">
                            <Link2 size={12} className="text-emerald-400 flex-shrink-0" />
                            <span className="text-xs text-white truncate">{link.label || link.url}</span>
                            <ExternalLink size={10} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0 ml-auto" />
                          </a>
                          {!isViewer && (
                            <button onClick={() => removeLink(link.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      {selectedItem.links.length === 0 && !showAddLink && (
                        <p className="text-xs text-slate-600 italic">No links yet</p>
                      )}
                      {showAddLink && (
                        <div className="flex flex-col gap-2 bg-slate-900/40 rounded-xl p-3 mt-1">
                          <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Label — e.g. Google Maps, Booking ref"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
                          <div className="flex gap-2">
                            <button onClick={() => { setShowAddLink(false); setLinkLabel(""); setLinkUrl(""); }}
                              className="flex-1 py-1.5 border border-slate-600 text-slate-400 text-xs rounded-lg hover:text-white transition-colors">Cancel</button>
                            <button onClick={addLink} disabled={addingLink || !linkUrl.trim()}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                              {addingLink ? "Adding…" : "Add Link"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Files */}
                  <div className="px-4 py-3 pb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Files</span>
                      {!isViewer && (
                        <button onClick={() => fileRef.current?.click()} disabled={uploadingFile}
                          className="flex items-center gap-1 text-xs text-slate-600 hover:text-emerald-400 transition-colors disabled:opacity-50">
                          <Upload size={11} /> {uploadingFile ? "Uploading…" : "Upload"}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {selectedItem.files.map((file) => {
                        const isImg = file.mime_type?.startsWith("image/");
                        const isPdf = file.mime_type === "application/pdf";
                        return (
                          <div key={file.id} className="flex items-center gap-2">
                            <a href={file.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 bg-slate-900/60 hover:bg-slate-700/60 rounded-lg transition-colors group">
                              {isImg ? <FileImage size={12} className="text-blue-400 flex-shrink-0" />
                                : isPdf ? <FileText size={12} className="text-red-400 flex-shrink-0" />
                                : <File size={12} className="text-slate-400 flex-shrink-0" />}
                              <span className="text-xs text-white truncate">{file.name}</span>
                              <ExternalLink size={10} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0 ml-auto" />
                            </a>
                            {!isViewer && (
                              <button onClick={() => removeFile(file.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {selectedItem.files.length === 0 && !uploadingFile && (
                        <p className="text-xs text-slate-600 italic">No files — upload tickets, PDFs, confirmations</p>
                      )}
                      {uploadingFile && <p className="text-xs text-emerald-400 animate-pulse">Uploading…</p>}
                    </div>
                    {uploadError && <p className="text-xs text-red-400 mt-2">{uploadError}</p>}
                    <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
