export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

interface ImportTransaction {
  date: string;
  category: string;
  currency?: string;
  amount?: number;
  myr_amount: number;
  foreign_amount?: number; // Legacy support
  paid_by: string;
  payment_type: string;
  wallet?: string;
  split_type: string;
  split_participants: string | Array<{ name: string; amount?: number }>;
  notes?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();
  const body = await req.json();
  const { format, data: importData } = body;

  let transactions: ImportTransaction[] = [];

  // Parse based on format
  if (format === "csv") {
    const lines = importData.trim().split("\n");
    const headers = lines[0].split(",").map((h: string) => h.trim());

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: any = {};
      headers.forEach((header: string, idx: number) => {
        row[header] = values[idx]?.trim() || "";
      });

      transactions.push({
        date: row.date,
        category: row.category,
        currency: row.currency || "MYR",
        amount: row.amount ? parseFloat(row.amount) : undefined,
        myr_amount: parseFloat(row.myr_amount),
        foreign_amount: row.foreign_amount ? parseFloat(row.foreign_amount) : undefined,
        paid_by: row.paid_by,
        payment_type: row.payment_type || "Cash",
        wallet: row.wallet || undefined,
        split_type: row.split_type || "even",
        split_participants: row.split_participants,
        notes: row.notes || undefined,
      });
    }
  } else if (format === "json") {
    const parsed = typeof importData === "string" ? JSON.parse(importData) : importData;
    transactions = parsed.transactions || [];
  } else {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  // Validate and prepare data
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Fetch trip info for currency validation
  const { data: trip } = await db
    .from("trips")
    .select("foreign_currency, foreign_currency_2")
    .eq("id", params.id)
    .single();

  const allowedCurrencies = ["MYR", trip?.foreign_currency];
  if (trip?.foreign_currency_2 && trip.foreign_currency_2 !== "None") {
    allowedCurrencies.push(trip.foreign_currency_2);
  }

  // Fetch trip travelers and wallets
  const { data: travelers } = await db
    .from("travelers")
    .select("id, name")
    .eq("trip_id", params.id);

  const { data: wallets } = await db
    .from("wallets")
    .select("id, name, traveler_id, travelers(name)")
    .eq("trip_id", params.id);

  // Fetch existing expenses for duplicate detection
  const { data: existingExpenses } = await db
    .from("expenses")
    .select("date, category, myr_amount")
    .eq("trip_id", params.id);

  const travelerMap = new Map(
    (travelers || []).map((t) => [t.name.toLowerCase(), t.id])
  );

  const walletMap = new Map(
    (wallets || []).map((w) => [
      `${(w.travelers as any)?.name?.toLowerCase()}-${w.name.toLowerCase()}`,
      w.id,
    ])
  );

  const duplicateSet = new Set(
    (existingExpenses || []).map(
      (e) => `${e.date}|${e.category.toLowerCase()}|${e.myr_amount}`
    )
  );

  const validTransactions: any[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    const rowNum = i + 2; // +2 because row 1 is header, array is 0-indexed

    // Check for duplicates
    const dupKey = `${txn.date}|${txn.category.toLowerCase()}|${txn.myr_amount}`;
    if (duplicateSet.has(dupKey)) {
      warnings.push(`Row ${rowNum}: Duplicate transaction skipped (${txn.category})`);
      continue;
    }

    // Validate required fields
    if (!txn.date) {
      errors.push({ row: rowNum, field: "date", message: "Date is required" });
      continue;
    }
    if (!txn.category) {
      errors.push({ row: rowNum, field: "category", message: "Category is required" });
      continue;
    }
    if (!txn.myr_amount || isNaN(txn.myr_amount)) {
      errors.push({ row: rowNum, field: "myr_amount", message: "Valid MYR amount is required" });
      continue;
    }

    // Validate currency
    const currency = txn.currency || "MYR";
    if (!allowedCurrencies.includes(currency)) {
      errors.push({
        row: rowNum,
        field: "currency",
        message: `Currency "${currency}" not allowed for this trip. Allowed: ${allowedCurrencies.join(", ")}`,
      });
      continue;
    }

    // Match paid_by traveler
    const paidByTravelerId = travelerMap.get(txn.paid_by.toLowerCase());
    if (!paidByTravelerId) {
      errors.push({
        row: rowNum,
        field: "paid_by",
        message: `Traveler "${txn.paid_by}" not found`,
      });
      continue;
    }

    // Match wallet if provided
    let walletId: string | null = null;
    if (txn.wallet) {
      const walletKey = `${txn.paid_by.toLowerCase()}-${txn.wallet.toLowerCase()}`;
      walletId = walletMap.get(walletKey) || null;
      if (!walletId) {
        errors.push({
          row: rowNum,
          field: "wallet",
          message: `Wallet "${txn.wallet}" not found for ${txn.paid_by}`,
        });
        continue;
      }
    }

    // Parse split participants
    let splitParticipants: Array<{ traveler_id: string; amount?: number }> = [];
    if (typeof txn.split_participants === "string") {
      const names = txn.split_participants.split(";").map((n) => n.trim()).filter(Boolean);
      for (const name of names) {
        const travelerId = travelerMap.get(name.toLowerCase());
        if (!travelerId) {
          errors.push({
            row: rowNum,
            field: "split_participants",
            message: `Participant "${name}" not found`,
          });
          break;
        }
        splitParticipants.push({ traveler_id: travelerId });
      }
    } else if (Array.isArray(txn.split_participants)) {
      for (const participant of txn.split_participants) {
        const travelerId = travelerMap.get(participant.name.toLowerCase());
        if (!travelerId) {
          errors.push({
            row: rowNum,
            field: "split_participants",
            message: `Participant "${participant.name}" not found`,
          });
          break;
        }
        splitParticipants.push({
          traveler_id: travelerId,
          amount: participant.amount,
        });
      }
    }

    if (errors.some((e) => e.row === rowNum)) continue;

    validTransactions.push({
      trip_id: params.id,
      date: txn.date,
      category: txn.category,
      currency: txn.currency || "MYR",
      myr_amount: txn.myr_amount,
      foreign_amount: txn.amount || txn.foreign_amount || null,
      paid_by_id: paidByTravelerId,
      payment_type: txn.payment_type,
      wallet_id: walletId,
      split_type: txn.split_type,
      notes: txn.notes || null,
      split_participants: splitParticipants,
    });
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        errors,
        warnings,
        valid_count: validTransactions.length,
        total_count: transactions.length,
      },
      { status: 400 }
    );
  }

  // Insert transactions
  let insertedCount = 0;
  for (const txn of validTransactions) {
    const { split_participants, ...expenseData } = txn;

    const { data: expense, error: expenseError } = await db
      .from("expenses")
      .insert(expenseData)
      .select()
      .single();

    if (expenseError) {
      errors.push({
        row: insertedCount + 2,
        field: "database",
        message: expenseError.message,
      });
      continue;
    }

    // Insert splits
    const splits = split_participants.map((sp: any) => ({
      expense_id: expense.id,
      traveler_id: sp.traveler_id,
      amount:
        sp.amount !== undefined
          ? sp.amount
          : Math.round((txn.myr_amount / split_participants.length) * 100) / 100,
      is_settled: false,
    }));

    const { error: splitsError } = await db.from("expense_splits").insert(splits);

    if (splitsError) {
      errors.push({
        row: insertedCount + 2,
        field: "splits",
        message: splitsError.message,
      });
      await db.from("expenses").delete().eq("id", expense.id);
      continue;
    }

    insertedCount++;
  }

  return NextResponse.json({
    success: true,
    inserted_count: insertedCount,
    total_count: transactions.length,
    warnings,
    errors: errors.length > 0 ? errors : undefined,
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}
