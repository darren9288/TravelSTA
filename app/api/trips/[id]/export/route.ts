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

  // Build query for expenses with splits and travelers
  let query = db
    .from("expenses")
    .select(`
      *,
      paid_by_traveler:travelers!expenses_paid_by_fkey(id, name),
      paid_by_wallet:wallets(id, name),
      splits(
        *,
        traveler:travelers(id, name)
      )
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

  if (format === "csv") {
    // Generate CSV
    const csvRows = [
      [
        "date",
        "description",
        "amount",
        "currency",
        "paid_by_name",
        "paid_by_wallet",
        "category",
        "split_type",
        "split_participants",
        "notes",
      ].join(","),
    ];

    for (const expense of expenses || []) {
      const splits = expense.splits || [];
      const participantNames = splits
        .map((s: any) => s.traveler?.name || "")
        .filter(Boolean)
        .join(";");

      csvRows.push(
        [
          expense.date,
          `"${expense.description.replace(/"/g, '""')}"`,
          expense.amount,
          expense.currency,
          expense.paid_by_traveler?.name || "",
          expense.paid_by_wallet?.name || "",
          expense.category || "",
          splits.length > 0 && splits.every((s: any) => s.amount === splits[0].amount)
            ? "equal"
            : "custom",
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
      const splits = expense.splits || [];
      return {
        date: expense.date,
        description: expense.description,
        amount: expense.amount,
        currency: expense.currency,
        paid_by: expense.paid_by_traveler?.name || "",
        paid_by_wallet: expense.paid_by_wallet?.name || "",
        category: expense.category || "",
        split_type:
          splits.length > 0 && splits.every((s: any) => s.amount === splits[0].amount)
            ? "equal"
            : "custom",
        split_participants: splits.map((s: any) => ({
          name: s.traveler?.name || "",
          amount: s.amount,
        })),
        notes: expense.notes || "",
      };
    });

    const exportData = {
      trip_id: trip.id,
      trip_name: trip.name,
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
