export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";

// POST /api/push/subscribe
// Body: { subscription: PushSubscription }
//   Saves the browser's push subscription so the server can later send
//   pushes to this device. ON CONFLICT updates last_seen_at so the row
//   stays fresh even on repeat subscribes.
// DELETE /api/push/subscribe?endpoint=...
//   Removes the subscription — fired when the user toggles notifications off
//   in the app (or revokes permission in the browser).

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sub = body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  const ua = req.headers.get("user-agent")?.slice(0, 200) ?? null;
  const db = serverDb();

  // Upsert on (user_id, endpoint). Same browser re-subscribing just updates
  // the keys + last_seen_at instead of creating duplicates.
  const { error } = await db
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: ua,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  const db = serverDb();
  const { error } = await db
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
