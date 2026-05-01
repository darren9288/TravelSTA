"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import { Trip } from "@/lib/supabase";
import { Download, Upload, Calendar, FileJson, FileText, AlertCircle, CheckCircle2, XCircle } from "lucide-react";

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  inserted_count?: number;
  total_count?: number;
  warnings?: string[];
  errors?: ValidationError[];
  valid_count?: number;
}

export default function ImportExportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const tripRes = await fetch(`/api/trips/${id}`, { cache: "no-store" }).then((r) => r.json());
    setTrip(tripRes.error ? null : tripRes);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = async (format: "csv" | "json") => {
    setExporting(true);
    try {
      let url = `/api/trips/${id}/export?format=${format}`;
      if (useDateFilter) {
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `trip-export-${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export error:", error);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    setImporting(true);
    setImportResult(null);

    try {
      const text = await importFile.text();
      const format = importFile.name.endsWith(".json") ? "json" : "csv";

      const response = await fetch(`/api/trips/${id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, data: text }),
      });

      const result = await response.json();
      setImportResult(result);

      if (result.success && result.inserted_count > 0) {
        setTimeout(() => {
          router.push(`/trips/${id}/expenses`);
        }, 2000);
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        success: false,
        errors: [{ row: 0, field: "file", message: "Failed to parse file" }],
      });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Nav tripId={id} tripName={trip?.name} />
        <main className="md:ml-56 pb-24 md:pb-8 min-h-screen flex items-center justify-center">
          <div className="text-slate-400 text-sm">Loading...</div>
        </main>
      </>
    );
  }

  if (!trip) {
    return (
      <>
        <Nav tripId={id} />
        <main className="md:ml-56 pb-24 md:pb-8 min-h-screen flex items-center justify-center">
          <div className="text-red-400 text-sm">Trip not found</div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav tripId={id} tripName={trip.name} />
      <main className="md:ml-56 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
          <h1 className="text-xl font-bold text-white">Import / Export</h1>

          {/* Export Section */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-semibold text-white">Export Transactions</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use-date-filter"
                  checked={useDateFilter}
                  onChange={(e) => setUseDateFilter(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="use-date-filter" className="text-sm text-slate-300">
                  Filter by date range
                </label>
              </div>

              {useDateFilter && (
                <div className="flex gap-3 items-center pl-6">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <label className="text-xs text-slate-400">From:</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">To:</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => handleExport("csv")}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport("json")}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <FileJson className="w-4 h-4" />
                  Export JSON
                </button>
              </div>
            </div>
          </div>

          {/* Import Section */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-400" />
              <h2 className="text-base font-semibold text-white">Import Transactions</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select CSV or JSON file
                </label>
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 file:transition-colors"
                />
              </div>

              {importFile && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <FileText className="w-4 h-4" />
                  <span>{importFile.name}</span>
                  <span className="text-slate-500">
                    ({(importFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Upload className="w-4 h-4" />
                {importing ? "Importing..." : "Import Transactions"}
              </button>

              {/* Import Result */}
              {importResult && (
                <div className="mt-3 p-4 rounded-lg border border-slate-600 bg-slate-700/50">
                  {importResult.success ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-semibold text-sm">Import Successful</span>
                      </div>
                      <p className="text-sm text-slate-300">
                        Imported {importResult.inserted_count} of {importResult.total_count} transactions
                      </p>
                      {importResult.warnings && importResult.warnings.length > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 text-yellow-400 mb-1">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-xs font-semibold">Warnings:</span>
                          </div>
                          <ul className="text-xs text-slate-400 space-y-1 pl-6">
                            {importResult.warnings.map((warning, idx) => (
                              <li key={idx}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        Redirecting to expenses page...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-red-400">
                        <XCircle className="w-5 h-5" />
                        <span className="font-semibold text-sm">Import Failed</span>
                      </div>
                      {importResult.valid_count !== undefined && (
                        <p className="text-sm text-slate-300">
                          {importResult.valid_count} of {importResult.total_count} transactions are valid
                        </p>
                      )}
                      {importResult.errors && importResult.errors.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-red-400 mb-1">Errors:</div>
                          <ul className="text-xs text-slate-400 space-y-1 pl-4">
                            {importResult.errors.slice(0, 10).map((error, idx) => (
                              <li key={idx}>
                                Row {error.row}, {error.field}: {error.message}
                              </li>
                            ))}
                            {importResult.errors.length > 10 && (
                              <li className="text-slate-500">
                                ... and {importResult.errors.length - 10} more errors
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Import Notes:</h3>
            <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
              <li>Duplicate transactions (same date, category, MYR amount) will be skipped</li>
              <li>Traveler names and wallet names must match exactly (case-insensitive)</li>
              <li>Split participants should be separated by semicolons in CSV format</li>
              <li>All imported transactions will be added to existing transactions</li>
              <li>CSV columns: date, category, myr_amount, foreign_amount, paid_by, payment_type, wallet, split_type, split_participants, notes</li>
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}
