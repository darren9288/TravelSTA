import { Traveler, ExpenseSplit, Expense } from "./supabase";

export type NetBalance = {
  traveler: Traveler;
  paid: number;
  owed: number;
  net: number; // positive = creditor, negative = debtor
};

export type PaymentInstruction = {
  from: Traveler;
  to: Traveler;
  amount: number;
};

export function calculateSettlement(
  travelers: Traveler[],
  expenses: Expense[]
): { balances: NetBalance[]; instructions: PaymentInstruction[] } {
  // Only real travelers (not pools) participate in settlement
  const realTravelers = travelers.filter((t) => !t.is_pool);

  const balances: NetBalance[] = realTravelers.map((t) => {
    const paid = expenses
      .filter((e) => e.paid_by_id === t.id && !travelers.find(x => x.id === t.id)?.is_pool)
      .reduce((s, e) => s + Number(e.myr_amount), 0);

    const owed = expenses
      .flatMap((e) => e.splits ?? [])
      .filter((s) => s.traveler_id === t.id)
      .reduce((s, sp) => s + Number(sp.amount), 0);

    return { traveler: t, paid, owed, net: paid - owed };
  });

  // Greedy algorithm to minimise transactions
  const creditors = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net);

  const debtors = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.net - b.net);

  const instructions: PaymentInstruction[] = [];

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const amount = Math.min(credit.net, -debt.net);

    if (amount > 0.005) {
      instructions.push({
        from: debt.traveler,
        to: credit.traveler,
        amount: Math.round(amount * 100) / 100,
      });
    }

    credit.net -= amount;
    debt.net += amount;

    if (Math.abs(credit.net) < 0.005) ci++;
    if (Math.abs(debt.net) < 0.005) di++;
  }

  return { balances, instructions };
}
