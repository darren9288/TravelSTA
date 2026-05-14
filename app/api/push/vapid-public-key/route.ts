export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// GET /api/push/vapid-public-key
// The browser needs the public half of the VAPID keypair to register a
// subscription. Safe to expose — that's the whole point of an asymmetric
// key. The private half stays on the server.
export async function GET() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  if (!pub) {
    return NextResponse.json(
      { error: "VAPID_PUBLIC_KEY not set on server" },
      { status: 500 }
    );
  }
  return NextResponse.json({ public_key: pub });
}
