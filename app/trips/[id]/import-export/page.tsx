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
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <div className="max-w-4xl mx-auto p-6">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <div className="max-w-4xl mx-auto p-6">
          <div className="text-center py-12 text-red-600">Trip not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Import / Export</h1>
          <p className="text-sm text-gray-600 mt-1">{trip.name}</p>
        </div>

        {/* Export Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Export Transactions</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use-date-filter"
                checked={useDateFilter}
                onChange={(e) => setUseDateFilter(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <label htmlFor="use-date-filter" className="text-sm text-gray-700">
                Filter by date range
              </label>
            </div>

            {useDateFilter && (
              <div className="flex gap-4 items-center pl-6">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <label className="text-sm text-gray-600">From:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">To:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileText className="w-4 h-4" />
                Export as CSV
              </button>
              <button
                onClick={() => handleExport("json")}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileJson className="w-4 h-4" />
                Export as JSON
              </button>
            </div>
          </div>
        </div>

        {/* Import Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Import Transactions</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select CSV or JSON file
              </label>
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
            </div>

            {importFile && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileText className="w-4 h-4" />
                <span>{importFile.name}</span>
                <span className="text-gray-400">
                  ({(importFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!importFile || importing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              {importing ? "Importing..." : "Import Transactions"}
            </button>

            {/* Import Result */}
            {importResult && (
              <div className="mt-4 p-4 rounded-lg border">
                {importResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-semibold">Import Successful</span>
                    </div>
                    <p className="text-sm text-gray-700">
                      Imported {importResult.inserted_count} of {importResult.total_count}{" "}
                      transactions
                    </p>
                    {importResult.warnings && importResult.warnings.length > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 text-yellow-700 mb-1">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm font-semibold">Warnings:</span>
                        </div>
                        <ul className="text-sm text-gray-600 space-y-1 pl-6">
                          {importResult.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-sm text-gray-500 mt-2">
                      Redirecting to expenses page...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-700">
                      <XCircle className="w-5 h-5" />
                      <span className="font-semibold">Import Failed</span>
                    </div>
                    {importResult.valid_count !== undefined && (
                      <p className="text-sm text-gray-700">
                        {importResult.valid_count} of {importResult.total_count} transactions
                        are valid
                      </p>
                    )}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div className="mt-3">
                        <div className="text-sm font-semibold text-red-700 mb-1">Errors:</div>
                        <ul className="text-sm text-gray-600 space-y-1 pl-4">
                          {importResult.errors.slice(0, 10).map((error, idx) => (
                            <li key={idx}>
                              Row {error.row}, {error.field}: {error.message}
                            </li>
                          ))}
                          {importResult.errors.length > 10 && (
                            <li className="text-gray-500">
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

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Import Notes:</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Duplicate transactions (same date, category, MYR amount) will be skipped</li>
            <li>Traveler names and wallet names must match exactly (case-insensitive)</li>
            <li>Split participants should be separated by semicolons in CSV format</li>
            <li>All imported transactions will be added to existing transactions</li>
            <li>CSV columns: date, category, myr_amount, foreign_amount, paid_by, payment_type, wallet, split_type, split_participants, notes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
