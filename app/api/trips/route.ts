export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = serverDb();

  // Get trip IDs this user is a member of
  const { data: memberships } = await db
    .from("trip_members")
    .select("trip_id, role")
    .eq("user_id", user.id);

  if (!memberships?.length) return NextResponse.json([]);

  const tripIds = memberships.map((m) => m.trip_id);
  const roleMap = Object.fromEntries(memberships.map((m) => [m.trip_id, m.role]));

  const { data, error } = await db
    .from("trips")
    .select("*")
    .in("id", tripIds)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach the user's role to each trip
  const trips = (data ?? []).map((t) => ({ ...t, my_role: roleMap[t.id] ?? "viewer" }));
  return NextResponse.json(trips);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = serverDb();

  let join_code = randomCode();
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from("trips").select("id").eq("join_code", join_code).single();
    if (!data) break;
    join_code = randomCode();
  }

  const { data: trip, error } = await db.from("trips").insert({
    name: body.name,
    destination: body.destination ?? "",
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    foreign_currency: body.foreign_currency ?? "JPY",
    cash_rate: body.cash_rate ?? 1,
    wise_rate: body.wise_rate ?? 1,
    foreign_currency_2: body.foreign_currency_2 ?? null,
    cash_rate_2: body.cash_rate_2 ?? null,
    wise_rate_2: body.wise_rate_2 ?? null,
    join_code,
    created_by_user_id: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Creator automatically becomes admin member
  await db.from("trip_members").insert({
    trip_id: trip.id,
    user_id: user.id,
    role: "admin",
  });

  return NextResponse.json(trip, { status: 201 });
}
