import {
  Coffee, Sandwich, UtensilsCrossed, Soup, BedDouble, Plane, TrainFront, Car, Fuel,
  Ticket, PartyPopper, Gift, ShoppingBag, Package, WashingMachine, Luggage,
  Wallet, ArrowDownLeft, ArrowUpRight, MoreHorizontal, type LucideIcon,
} from "lucide-react";

// One place for a category's colour AND its icon, so an expense is
// recognisable without reading the label. Colours were already in
// ExpenseRow — moved here so nothing can drift between the two.
type CategoryStyle = { color: string; Icon: LucideIcon };

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  "Breakfast":      { color: "#f97316", Icon: Coffee },
  "Lunch":          { color: "#f97316", Icon: Sandwich },
  "Dinner":         { color: "#f97316", Icon: UtensilsCrossed },
  "Small Eat":      { color: "#f97316", Icon: Soup },
  "Hotel":          { color: "#6366f1", Icon: BedDouble },
  "Flight":         { color: "#3b82f6", Icon: Plane },
  "Transport":      { color: "#3b82f6", Icon: TrainFront },
  "Car Rental":     { color: "#3b82f6", Icon: Car },
  "Fuel":           { color: "#3b82f6", Icon: Fuel },
  "Activity":       { color: "#ec4899", Icon: Ticket },
  "Entertainment":  { color: "#ec4899", Icon: PartyPopper },
  "Souvenirs":      { color: "#a855f7", Icon: Gift },
  "Shopping":       { color: "#a855f7", Icon: ShoppingBag },
  "Supplies":       { color: "#a855f7", Icon: Package },
  "Laundry":        { color: "#14b8a6", Icon: WashingMachine },
  "Travel Related": { color: "#14b8a6", Icon: Luggage },
  "Top Up":         { color: "#22c55e", Icon: Wallet },
  "Transfer In":    { color: "#22c55e", Icon: ArrowDownLeft },
  "Transfer Out":   { color: "#22c55e", Icon: ArrowUpRight },
  "Others":         { color: "#94a3b8", Icon: MoreHorizontal },
};

const FALLBACK: CategoryStyle = { color: "#94a3b8", Icon: MoreHorizontal };

/** Never throws on an unknown/renamed category — falls back to a neutral dot. */
export function categoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLE[category] ?? FALLBACK;
}

/** First letter of a name, for the traveller monogram. Handles empty names. */
export function initial(name: string | undefined | null): string {
  const t = (name ?? "").trim();
  return t ? t[0].toUpperCase() : "?";
}
