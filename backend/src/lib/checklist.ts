// ---------------------------------------------------------------------------
// Checklist – computed view (never persisted). The «ledger architecture»:
//   net_balance(U) =
//     Σ(Expense.amountKurus where paidBy=U)
//   − Σ(computed share for U in ALL group expenses, based on CURRENT member list)
//   + Σ(CONFIRMED Payment.amountKurus where from_user=U)
//   − Σ(CONFIRMED Payment.amountKurus where to_user=U)
// ---------------------------------------------------------------------------

export interface ExpenseForBalance {
  paidBy: string;
  amountKurus: number;
}

export interface PaymentForBalance {
  fromUser: string;
  toUser: string;
  amountKurus: number;
}

export interface ChecklistTransfer {
  from_user: string;   // debtor (user id)
  to_user: string;     // creditor (user id)
  amount_kurus: number;
  pending_payment_id: string | null;
}

/**
 * Compute the per-member share amounts for a single expense using the CURRENT
 * member list (the ExpenseSplit table is NOT used as a computation source).
 *
 * Rounding rule: base = floor(amountKurus / n). The leftover remainder kurus
 * is added to the payer's own share, so the sum always equals amountKurus.
 */
export function computeExpenseSplits(
  amountKurus: number,
  payerId: string,
  memberIds: string[],
): { userId: string; shareAmountKurus: number }[] {
  const n = memberIds.length;
  if (n === 0) return [];
  const base = Math.floor(amountKurus / n);
  const remainder = amountKurus - base * n;
  return memberIds.map((userId) => ({
    userId,
    shareAmountKurus: base + (userId === payerId ? remainder : 0),
  }));
}

/**
 * Compute net balances for every member given the current ledger entries.
 *
 * Splits are recomputed LIVE from the CURRENT member list for every call;
 * the persisted ExpenseSplit table is no longer a computation source.
 *
 * Full formula:
 *   net_balance(U) = Σ(Expense.amountKurus where paidBy=U)
 *                  − Σ(computed share for U across every expense)
 *                  + Σ(CONFIRMED Payment.amountKurus where from_user=U)
 *                  − Σ(CONFIRMED Payment.amountKurus where to_user=U)
 */
export function computeNetBalances(
  memberIds: string[],
  expenses: ExpenseForBalance[],
  payments: PaymentForBalance[] = [],
): Map<string, number> {
  const balances = new Map<string, number>();

  // Initialise every member with 0 so they are present even with no activity
  for (const id of memberIds) {
    balances.set(id, 0);
  }

  for (const exp of expenses) {
    // + what the payer spent
    balances.set(exp.paidBy, (balances.get(exp.paidBy) ?? 0) + exp.amountKurus);

    // − each member's live-computed share
    for (const split of computeExpenseSplits(exp.amountKurus, exp.paidBy, memberIds)) {
      balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.shareAmountKurus);
    }
  }

  // Confirmed payment contributions
  for (const payment of payments) {
    // payer settles debt -> balance rises toward 0
    balances.set(payment.fromUser, (balances.get(payment.fromUser) ?? 0) + payment.amountKurus);
    // receiver's claim reduced -> balance falls toward 0
    balances.set(payment.toUser,   (balances.get(payment.toUser)   ?? 0) - payment.amountKurus);
  }

  return balances;
}

/**
 * Greedy debt simplification producing a small (near-minimal) number of transfers
 * using a greedy heuristic, annotating pending payments where possible.
 */
export function simplifyDebts(
  balances: Map<string, number>,
  pendingPayments: { id: string; fromUser: string; toUser: string; amountKurus: number }[] = [],
): ChecklistTransfer[] {
  let debtors: { userId: string; amount: number }[] = [];
  let creditors: { userId: string; amount: number }[] = [];

  for (const [userId, balance] of balances.entries()) {
    if (balance > 0) {
      creditors.push({ userId, amount: balance });
    } else if (balance < 0) {
      debtors.push({ userId, amount: -balance }); // store as positive
    }
  }

  const transfers: ChecklistTransfer[] = [];
  // shallow copy to track which pending payments we've already used
  const available = [...pendingPayments];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));
    creditors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);

    // find a matching pending payment (first match)
    const idx = available.findIndex(
      (p) => p.fromUser === debtor.userId && p.toUser === creditor.userId && p.amountKurus === amount,
    );
    let pendingId: string | null = null;
    if (idx !== -1) {
      pendingId = available[idx].id;
      available.splice(idx, 1); // each pending payment used at most once
    }

    transfers.push({
      from_user: debtor.userId,
      to_user: creditor.userId,
      amount_kurus: amount,
      pending_payment_id: pendingId,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    // drop anyone who reached 0
    debtors = debtors.filter((d) => d.amount > 0);
    creditors = creditors.filter((c) => c.amount > 0);
  }

  return transfers;
}
