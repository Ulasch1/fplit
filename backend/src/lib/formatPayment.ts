export function formatPayment(payment: {
  id: string;
  groupId: string;
  fromUser: string;
  toUser: string;
  amountKurus: number;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
}) {
  return {
    id: payment.id,
    group_id: payment.groupId,
    from_user: payment.fromUser,
    to_user: payment.toUser,
    amount_kurus: payment.amountKurus,
    status: payment.status,
    created_at: payment.createdAt,
    confirmed_at: payment.confirmedAt,
    rejection_reason: payment.rejectionReason,
    rejection_note: payment.rejectionNote,
  };
}
