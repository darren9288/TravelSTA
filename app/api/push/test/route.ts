export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-server";
import { sendPushToUser } from "@/lib/push";

// POST /api/push/test
// Sends a "Hello from TravelSTA" push to every device the current user
// has subscribed. Used by the Settings → Notifications toggle's "Send
// test" button so the owner can verify end-to-end without waiting for
// a real event.
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await sendPushToUser(user.id, {
      title: "TravelSTA test",
      body: "If you see this, push notifications are working on this device. 🎉",
      url: "/",
      tag: "test",
    });
    if (result.sent === 0 && result.failed === 0) {
      return NextResponse.json(
        { error: "No devices subscribed yet — tap Enable first." },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
