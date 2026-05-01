export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = serverDb();
  const searchParams = req.nextUrl.searchParams;
  const format = searchParams.get("format") || "json";
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  // Fetch trip info
  const { data: trip, error: tripError } = await db
    .from("trips")
    .select("*")
    .eq("id", params.id)
    .single();

  if (tripError) {
    return NextResponse.json({ error: tripError.message }, { status: 404 });
  }

  // Build query for expenses
  let query = db
    .from("expenses")
    .select(`
      *,
      paid_by:travelers!paid_by_id(id, name),
      wallet:wallets(id, name)
    `)
    .eq("trip_id", params.id)
    .order("date", { ascending: true });

  // Apply date filters if provided
  if (startDate) {
    query = query.gte("date", startDate);
  }
  if (endDate) {
    query = query.lte("date", endDate);
  }

  const { data: expenses, error: expensesError } = await query;

  if (expensesError) {
    return NextResponse.json({ error: expensesError.message }, { status: 500 });
  }

  // Fetch splits for all expenses
  const expenseIds = (expenses || []).map((e: any) => e.id);
  let splits: any[] = [];

  if (expenseIds.length > 0) {
    const { data: splitsData } = await db
      .from("expense_splits")
      .select("*, traveler:travelers(id, name)")
      .in("expense_id", expenseIds);
    splits = splitsData || [];
  }

  if (format === "csv") {
    // Generate CSV
    const csvRows = [
      [
        "date",
        "category",
        "currency",
        "amount",
        "myr_amount",
        "paid_by",
        "payment_type",
        "wallet",
        "split_type",
        "split_participants",
        "notes",
      ].join(","),
    ];

    for (const expense of expenses || []) {
      const expenseSplits = splits.filter((s: any) => s.expense_id === expense.id);
      const participantNames = expenseSplits
        .map((s: any) => s.traveler?.name || "")
        .filter(Boolean)
        .join(";");

      csvRows.push(
        [
          expense.date,
          `"${expense.category.replace(/"/g, '""')}"`,
          expense.currency || "MYR",
          expense.foreign_amount || expense.myr_amount,
          expense.myr_amount,
          expense.paid_by?.name || "",
          expense.payment_type,
          expense.wallet?.name || "",
          expense.split_type,
          `"${participantNames}"`,
          `"${(expense.notes || "").replace(/"/g, '""')}"`,
        ].join(",")
      );
    }

    const csv = csvRows.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="trip-${trip.name.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } else {
    // Generate JSON
    const transactions = (expenses || []).map((expense: any) => {
      const expenseSplits = splits.filter((s: any) => s.expense_id === expense.id);
      return {
        date: expense.date,
        category: expense.category,
        currency: expense.currency || "MYR",
        amount: expense.foreign_amount || expense.myr_amount,
        myr_amount: expense.myr_amount,
        paid_by: expense.paid_by?.name || "",
        payment_type: expense.payment_type,
        wallet: expense.wallet?.name || "",
        split_type: expense.split_type,
        split_participants: expenseSplits.map((s: any) => ({
          name: s.traveler?.name || "",
          amount: s.amount,
        })),
        notes: expense.notes || "",
      };
    });

    const exportData = {
      trip_id: trip.id,
      trip_name: trip.name,
      foreign_currency: trip.foreign_currency,
      foreign_currency_2: trip.foreign_currency_2 || null,
      exported_at: new Date().toISOString(),
      date_range: {
        start: startDate || "all",
        end: endDate || "all",
      },
      transactions,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="trip-${trip.name.replace(/[^a-z0-9]/gi, "-")}-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  }
}
