import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Server-side client: uses service role key to bypass Supabase CDN caching.
// Safe because this only runs in Next.js API routes, never in the browser.
export function serverDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, init?: RequestInit) =>
          fetch(url, { ...init, cache: "no-store" }),
      },
    }
  );
}

export type Trip = {
  id: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  foreign_currency: string;
  cash_rate: number;
  wise_rate: number;
  foreign_currency_2?: string | null;
  cash_rate_2?: number | null;
  wise_rate_2?: number | null;
  join_code: string;
  created_at: string;
  my_traveler_id?: string | null;
  my_role?: string | null; // "admin" | "editor" | "viewer" | null
  background_image_url?: string | null;
};

export type Traveler = {
  id: string;
  trip_id: string;
  name: string;
  color: string;
  is_pool: boolean;
  pool_currency: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  trip_id: string;
  date: string;
  category: string;
  split_type: string;
  paid_by_id: string;
  payment_type: string;
  currency: string;
  foreign_amount: number | null;
  myr_amount: number;
  notes: string | null;
  created_by_id: string | null;
  wallet_id?: string | null;
  created_at: string;
  paid_by?: Traveler;
  splits?: ExpenseSplit[];
};

export type ExpenseSplit = {
  id: string;
  expense_id: string;
  traveler_id: string;
  amount: number;
  is_settled: boolean;
  locked?: boolean;
  from_wallet_id?: string | null;
  to_wallet_id?: string | null;
  traveler?: Traveler;
};

export type SettlementPayment = {
  id: string;
  trip_id: string;
  from_traveler_id: string;
  to_traveler_id: string;
  amount: number;
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  created_at: string;
};

export type PoolTopup = {
  id: string;
  trip_id: string;
  pool_id: string;
  contributed_by_id: string;
  myr_amount: number;
  foreign_amount: number | null;
  date: string;
  notes: string | null;
  created_at: string;
  pool?: Traveler;
  contributed_by?: Traveler;
};

export const CATEGORIES = [
  "Activity", "Breakfast", "Lunch", "Dinner", "Small Eat",
  "Entertainment", "Others", "Souvenirs", "Supplies", "Laundry",
  "Hotel", "Flight", "Transport", "Car Rental", "Fuel",
  "Travel Related", "Top Up", "Transfer In", "Transfer Out",
];

export const PAYMENT_TYPES = [
  "Cash", "Debit Card", "Credit Card", "TNG", "Wise",
];

export const TRAVELER_COLORS = [
  "#6366f1", "#3b82f6", "#22c55e", "#f97316",
  "#ec4899", "#eab308", "#14b8a6", "#a855f7",
];
