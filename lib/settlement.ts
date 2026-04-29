import { Traveler, ExpenseSplit, Expense, SettlementPayment } from "./supabase";

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
  expenses: Expense[],
  payments: SettlementPayment[] = []
): { balances: NetBalance[]; instructions: PaymentInstruction[] } {
  // Only real travelers (not pools) participate in settlement
  const realTravelers = travelers.filter((t) => !t.is_pool);

  // Pool traveler IDs — their expenses are excluded from settlement because
  // the pool fund covers those costs, not individual travelers.
  const poolIds = new Set(travelers.filter((t) => t.is_pool).map((t) => t.id));

  // Use ALL splits (settled or not) as the base, excluding pool-paid expenses.
  // Settlement payments are the only mechanism that reduces outstanding balances.
  const allSplits = expenses
    .filter((e) => !poolIds.has(e.paid_by_id))
    .flatMap((e) => (e.splits ?? []).map((s) => ({ ...s, paid_by_id: e.paid_by_id })));

  const balances: NetBalance[] = realTravelers.map((t) => {
    // Credit: split amounts on expenses this traveler paid (others owe them)
    const paid = allSplits
      .filter((s) => s.paid_by_id === t.id && s.traveler_id !== t.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    // Debit: this traveler's own splits on others' expenses
    const owed = allSplits
      .filter((s) => s.traveler_id === t.id && s.paid_by_id !== t.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    // Settlement payments already made reduce the outstanding balance
    const paymentsMade = payments
      .filter((p) => p.from_traveler_id === t.id)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const paymentsReceived = payments
      .filter((p) => p.to_traveler_id === t.id)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    // Payments made reduce your outstanding debt; payments received reduce your outstanding credit.
    const net = (paid - owed) + paymentsMade - paymentsReceived;
    return { traveler: t, paid, owed, net };
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
