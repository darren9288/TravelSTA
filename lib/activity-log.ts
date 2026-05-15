import { serverDb } from "./supabase";
import { NextRequest } from "next/server";

// Server-side activity logger. Fire-and-forget — a logging failure must
// never break the action the user just performed.
//
// Usage:
//   void logActivity({ action: 'expense_add', userId, tripId, details: { ... }, req })
//
// `req` is optional but recommended — we pull user agent + IP from it for
// forensics. Without `req`, those columns are null.

export type ActivityAction =
  | "page_view"
  | "sign_in"
  | "sign_out"
  | "expense_add"
  | "expense_edit"
  | "expense_delete"
  | "split_toggle"
  | "split_bulk_settle"
  | "settle_all"
  | "pool_topup"
  | "wallet_topup"
  | "wallet_add"
  | "wallet_delete"
  | "traveler_add"
  | "traveler_archive"
  | "traveler_delete"
  | "trip_create"
  | "trip_edit"
  | "trip_delete"
  | "trip_join"
  | "itinerary_add"
  | "itinerary_edit"
  | "itinerary_delete"
  | "ai_ask"
  | "ai_parse_expense"
  | "ai_parse_receipt"
  | "ai_recap"
  | "ai_categorize"
  | "ai_suggest"
  | "ai_token_activate"
  | "ai_token_delete"
  | "notification_pref_change"
  | "push_subscribe"
  | "push_unsubscribe"
  | "other";

type LogInput = {
  action: ActivityAction;
  userId?: string | null;
  tripId?: string | null;
  details?: Record<string, unknown>;
  req?: NextRequest;
};

export async function logActivity(input: LogInput): Promise<void> {
  try {
    if (!input.userId) return; // Anonymous actions aren't useful to log.
    const db = serverDb();

    let userAgent: string | null = null;
    let ip: string | null = null;
    if (input.req) {
      userAgent = input.req.headers.get("user-agent");
      // Try common proxy headers (Vercel sets x-forwarded-for); fall back to null.
      ip =
        input.req.headers.get("x-real-ip") ??
        input.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
    }

    await db.from("activity_log").insert({
      user_id: input.userId,
      trip_id: input.tripId ?? null,
      action: input.action,
      details: input.details ?? {},
      user_agent: userAgent,
      ip,
    });
  } catch (e) {
    console.error("[activity-log]", (e as Error).message);
  }
}
