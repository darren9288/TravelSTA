export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { parseExpenses } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const { text, foreign_currency, today } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });
  try {
    const result = await parseExpenses(text, foreign_currency ?? "JPY", today ?? new Date().toISOString().split("T")[0]);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
