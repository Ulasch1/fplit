export function formatExpense(expense: {
  id: string;
  groupId: string;
  description: string;
  amountKurus: number;
  paidBy: string;
  createdAt: Date;
  splits: { userId: string; shareAmountKurus: number }[];
}) {
  return {
    id: expense.id,
    group_id: expense.groupId,
    description: expense.description,
    amount_kurus: expense.amountKurus,
    paid_by: expense.paidBy,
    created_at: expense.createdAt,
    splits: expense.splits.map((s) => ({
      user_id: s.userId,
      share_amount_kurus: s.shareAmountKurus,
    })),
  };
}
