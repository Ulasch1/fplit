// ---------------------------------------------------------------------------
// Checklist – computed view (never persisted). The «ledger architecture»:
//   net_balance(U) =
//     Σ(Expense.amountKurus where paidBy=U)
//   − Σ(ExpenseSplit.shareAmountKurus where userId=U)
//   + Σ(CONFIRMED Payment.amountKurus where to_user=U)    // M7: add here
//   − Σ(CONFIRMED Payment.amountKurus where from_user=U)  // M7: add here
//
// In M6 the Payment table does not exist; the last two terms contribute 0.
// ---------------------------------------------------------------------------

export interface ExpenseForBalance {
  paidBy: string;
  amountKurus: number;
  splits: { userId: string; shareAmountKurus: number }[];
}

export interface ChecklistTransfer {
  from_user: string;   // debtor (user id)
  to_user: string;     // creditor (user id)
  amount_kurus: number;
  pending_payment_id: string | null; // always null in M6 (Payment table arrives in M7)
}

/**
 * Compute net balances for every member given the current ledger entries.
 *
 * Formula applied (M6 – only Expense + ExpenseSplit):
 *   net_balance(U) = Σ(Expense.amountKurus where paidBy=U)
 *                  − Σ(ExpenseSplit.shareAmountKurus where userId=U)
 *
 * M7 will add the CONFIRMED Payment contributions.
 */
export function computeNetBalances(
  memberIds: string[],
  expenses: ExpenseForBalance[],
): Map<string, number> {
  const balances = new Map<string, number>();

  // Initialise every member with 0 so they are present even with no activity
  for (const id of memberIds) {
    balances.set(id, 0);
  }

  for (const exp of expenses) {
    // + what the payer spent
    balances.set(exp.paidBy, (balances.get(exp.paidBy) ?? 0) + exp.amountKurus);

    // − each member's share
    for (const split of exp.splits) {
      balances.set(split.userId, (balances.get(split.userId) ?? 0) - split.shareAmountKurus);
    }
  }

  // M7: here you would add CONFIRMED payment contributions:
  //   for each payment where to_user = U  →  balances.set(U, val + amount)
  //   for each payment where from_user = U →  balances.set(U, val - amount)

  return balances;
}

/**
 * Greedy debt simplification producing a small (near-minimal) number of transfers
 * using a greedy heuristic.
 *
 * - Splits users into debtors (balance < 0) and creditors (balance > 0).
 * - Repeatedly picks the largest debtor and largest creditor, transfers
 *   min(|debt|, credit) between them, and reduces both balances.
 * - Continues until no debtors remain.
 *
 * Deterministic: ties are broken by userId for stable output.
 * Returns an empty array when everyone is settled (all balances 0).
 */
export function simplifyDebts(balances: Map<string, number>): ChecklistTransfer[] {
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

  while (debtors.length > 0 && creditors.length > 0) {
    // sort largest-first, break ties deterministically
    debtors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));
    creditors.sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId));

    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);

    transfers.push({
      from_user: debtor.userId,
      to_user: creditor.userId,
      amount_kurus: amount,
      pending_payment_id: null,
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    // drop anyone who reached 0
    debtors = debtors.filter((d) => d.amount > 0);
    creditors = creditors.filter((c) => c.amount > 0);
  }

  return transfers;
}
