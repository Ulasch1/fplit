import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../db';
import { formatPayment } from '../lib/formatPayment';
import { computeNetBalances, ExpenseForBalance, PaymentForBalance } from '../lib/checklist';
import { RejectionReason } from '@prisma/client';

const router = Router();

// PATCH /:paymentId – confirm or reject a payment
router.patch('/:paymentId', requireAuth, async (req: Request, res: Response) => {
  try {
    const paymentId = req.params.paymentId;
    const { action, rejection_reason, rejection_note } = req.body;

    // 1. Fetch payment with basic details
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      res.status(404).json({ error: 'Payment not found' });
      return;
    }

    // 2. Only the payee (toUser) can act
    if (payment.toUser !== req.userId) {
      res.status(403).json({ error: 'Only the payee can confirm or reject this payment' });
      return;
    }

    // 3. Must be pending
    if (payment.status !== 'PENDING_CONFIRMATION') {
      res.status(409).json({ error: 'This payment is no longer pending' });
      return;
    }

    // 4. Validate action
    if (action !== 'CONFIRM' && action !== 'REJECT') {
      res.status(400).json({ error: 'action must be CONFIRM or REJECT' });
      return;
    }

    // Validate rejection details when REJECT
    let rejectionReason: string | null = null;
    let rejectionNote: string | null = null;
    if (action === 'REJECT') {
      const validReasons = ['FORGOT', 'WRONG_AMOUNT', 'OTHER'];
      if (!rejection_reason || !validReasons.includes(rejection_reason)) {
        res.status(400).json({ error: 'rejection_reason must be one of FORGOT, WRONG_AMOUNT, OTHER' });
        return;
      }
      rejectionReason = rejection_reason;
      if (rejection_reason === 'OTHER') {
        if (typeof rejection_note !== 'string' || rejection_note.trim().length === 0) {
          res.status(400).json({ error: 'rejection_note is required when reason is OTHER' });
          return;
        }
        rejectionNote = rejection_note.trim();
      } else {
        // ensure rejection_note is null for non-OTHER reasons
        rejectionNote = null;
      }
    }

    // 5. Execute update + notifications read + optional group close in one transaction
    const updatedPayment = await prisma.$transaction(async (tx) => {
      // Serialise per-group to avoid concurrent-confirm races
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.groupId}))`;

      let finalPayment;
      if (action === 'CONFIRM') {
        finalPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        });
      } else {
        // REJECT
        finalPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'REJECTED',
            rejectionReason: rejectionReason as RejectionReason,
            rejectionNote,
          },
        });
      }

      // Mark related notifications as read
      await tx.notification.updateMany({
        where: { relatedPaymentId: paymentId },
        data: { isRead: true },
      });

      // On CONFIRM, recompute group balances and close group if everyone settled
      if (action === 'CONFIRM') {
        const group = await tx.group.findUnique({
          where: { id: finalPayment.groupId },
          include: {
            members: { select: { userId: true } },
            expenses: {
              // only scalar fields needed; no splits loaded
            },
            payments: {
              where: { status: 'CONFIRMED' },
              select: { fromUser: true, toUser: true, amountKurus: true },
            },
          },
        });

        if (group) {
          const memberIds = group.members.map((m) => m.userId);
          const expensesForBalance: ExpenseForBalance[] = group.expenses.map((e) => ({
            paidBy: e.paidBy,
            amountKurus: e.amountKurus,
          }));
          const paymentsForBalance: PaymentForBalance[] = group.payments.map((p) => ({
            fromUser: p.fromUser,
            toUser: p.toUser,
            amountKurus: p.amountKurus,
          }));
          const balances = computeNetBalances(memberIds, expensesForBalance, paymentsForBalance);
          const allSettled = Array.from(balances.values()).every((v) => v === 0);

          if (allSettled) {
            await tx.group.update({
              where: { id: finalPayment.groupId },
              data: { status: 'CLOSED' },
            });
          }
        }
      }

      return finalPayment;
    });

    res.status(200).json(formatPayment(updatedPayment));
  } catch (error) {
    console.error('PATCH /payments/:paymentId error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
