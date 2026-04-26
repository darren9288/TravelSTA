import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Trip = {
  id: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  foreign_currency: string;
  cash_rate: number;
  wise_rate: number;
  join_code: string;
  created_at: string;
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
  foreign_amount: number | null;
  myr_amount: number;
  notes: string | null;
  created_by_id: string | null;
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
  traveler?: Traveler;
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
