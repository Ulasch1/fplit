import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { getActivationWindowMs } from '../lib/inviteConfig';
import { formatGroup } from '../lib/formatGroup';
import { formatExpense } from '../lib/formatExpense';
import { formatPayment } from '../lib/formatPayment';
import {
  computeNetBalances,
  simplifyDebts,
  ExpenseForBalance,
  PaymentForBalance,
} from '../lib/checklist';

const router = Router();

// POST /groups
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Group name is required' });
      return;
    }

    const trimmedName = name.trim();

    if (trimmedName.length > 100) {
      res.status(400).json({ error: 'Group name must be at most 100 characters' });
      return;
    }

    // Single transaction: create group and add creator as first member
    const group = await prisma.$transaction(async (tx) => {
      const newGroup = await tx.group.create({
        data: {
          name: trimmedName,
          ownerId: req.userId!,
          status: 'ACTIVE',
        },
      });

      await tx.groupMember.create({
        data: {
          groupId: newGroup.id,
          userId: req.userId!,
        },
      });

      return newGroup;
    });

    res.status(201).json(formatGroup(group));
  } catch (error) {
    console.error('POST /groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId },
      include: { group: true },
    });

    const groupIds = memberships.map((m) => m.groupId);

    // N+1‑free batch load: all members + expenses + CONFIRMED payments for all groups at once
    const detailedGroups = await prisma.group.findMany({
      where: { id: { in: groupIds } },
      include: {
        members: { select: { userId: true } },
        expenses: {
          select: {
            paidBy: true,
            amountKurus: true,
            splits: { select: { userId: true, shareAmountKurus: true } },
          },
        },
        payments: {
          where: { status: 'CONFIRMED' },
          select: { fromUser: true, toUser: true, amountKurus: true },
        },
      },
    });

    const groupMap = new Map(detailedGroups.map((g) => [g.id, g]));

    const groups = memberships.flatMap((m) => {
      const dg = groupMap.get(m.groupId);
      if (!dg) return []; // group deleted concurrently: skip this membership
      const memberIds = dg.members.map((mi) => mi.userId);
      const expensesForBalance: ExpenseForBalance[] = dg.expenses.map((e) => ({
        paidBy: e.paidBy,
        amountKurus: e.amountKurus,
        splits: e.splits.map((s) => ({ userId: s.userId, shareAmountKurus: s.shareAmountKurus })),
      }));
      const paymentsForBalance: PaymentForBalance[] = dg.payments.map((p) => ({
        fromUser: p.fromUser,
        toUser: p.toUser,
        amountKurus: p.amountKurus,
      }));
      const balances = computeNetBalances(memberIds, expensesForBalance, paymentsForBalance);
      const net_balance_kurus = balances.get(req.userId!) ?? 0;

      return [
        {
          ...formatGroup(m.group),
          net_balance_kurus,
        },
      ];
    });

    res.status(200).json(groups);
  } catch (error) {
    console.error('GET /groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /groups/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        expenses: {
          include: { splits: true },
          orderBy: { createdAt: 'asc' },
        },
        payments: {
          where: { status: 'CONFIRMED' },
          select: { fromUser: true, toUser: true, amountKurus: true },
        },
      },
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // Check membership
    const isMember = group.members.some((m) => m.userId === req.userId);
    if (!isMember) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }

    const membersList = group.members.map((m) => ({
      user_id: m.user.id,
      name: m.user.name,
      joined_at: m.joinedAt,
    }));

    // Compute checklist (M6)
    // Fetch pending payments for annotation
    const pendingPayments = await prisma.payment.findMany({
      where: { groupId, status: 'PENDING_CONFIRMATION' },
      select: { id: true, fromUser: true, toUser: true, amountKurus: true },
    });

    const memberIds = group.members.map((m) => m.userId);
    const expensesForBalance: ExpenseForBalance[] = group.expenses.map((e) => ({
      paidBy: e.paidBy,
      amountKurus: e.amountKurus,
      splits: e.splits.map((s) => ({ userId: s.userId, shareAmountKurus: s.shareAmountKurus })),
    }));
    const paymentsForBalance: PaymentForBalance[] = group.payments.map((p) => ({
      fromUser: p.fromUser,
      toUser: p.toUser,
      amountKurus: p.amountKurus,
    }));
    const balances = computeNetBalances(memberIds, expensesForBalance, paymentsForBalance);
    const checklist = simplifyDebts(balances, pendingPayments);

    res.status(200).json({
      ...formatGroup(group),
      members: membersList,
      expenses: group.expenses.map(formatExpense),
      checklist,
    });
  } catch (error) {
    console.error('GET /groups/:id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /groups/:id/owner
router.patch('/:id/owner', requireAuth, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;
    const { new_owner_id } = req.body;

    if (!new_owner_id || typeof new_owner_id !== 'string') {
      res.status(400).json({ error: 'new_owner_id is required' });
      return;
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // Only the current owner can transfer ownership
    if (group.ownerId !== req.userId) {
      res.status(403).json({ error: 'Only the group owner can transfer ownership' });
      return;
    }

    // New owner must be a member
    const newOwnerIsMember = group.members.some((m) => m.userId === new_owner_id);
    if (!newOwnerIsMember) {
      res.status(400).json({ error: 'New owner must be a member of the group' });
      return;
    }

    const result = await prisma.group.updateMany({
      where: { id: groupId, ownerId: req.userId },
      data: { ownerId: new_owner_id },
    });

    if (result.count === 0) {
      res.status(403).json({ error: 'Only the group owner can transfer ownership' });
      return;
    }

    const updatedGroup = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!updatedGroup) {
      throw new Error('Group disappeared after ownership transfer');
    }

    res.status(200).json(formatGroup(updatedGroup));
  } catch (error) {
    console.error('PATCH /groups/:id/owner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /groups/:id/invite-link
router.post('/:id/invite-link', requireAuth, async (req: Request, res: Response) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    if (group.ownerId !== req.userId) {
      res.status(403).json({ error: 'Only the group owner can generate an invite link' });
      return;
    }
    if (group.status === 'CLOSED') {
      res.status(400).json({ error: 'Cannot generate an invite link for a closed group' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');

    const newLink = await prisma.$transaction(async (tx) => {
      // Invalidate all existing non-EXPIRED links for this group
      await tx.inviteLink.updateMany({
        where: { groupId: group.id, status: { not: 'EXPIRED' } },
        data: { status: 'EXPIRED' },
      });

      return tx.inviteLink.create({
        data: {
          groupId: group.id,
          token,
        },
      });
    });

    const expiresAt = new Date(newLink.createdAt.getTime() + getActivationWindowMs());

    res.status(201).json({
      token: newLink.token,
      status: 'PENDING',
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('POST /groups/:id/invite-link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:groupId/expenses
router.post('/:groupId/expenses', requireAuth, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId;
    const { description, amount_kurus, paid_by } = req.body;

    // 1. Fetch group with members
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // 2. Caller membership check
    if (!group.members.some((m) => m.userId === req.userId)) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }

    // 3. Closed group check
    if (group.status === 'CLOSED') {
      res.status(400).json({ error: 'Cannot add an expense to a closed group' });
      return;
    }

    // 4. Description validation
    if (typeof description !== 'string' || description.trim().length === 0) {
      res.status(400).json({ error: 'Description is required' });
      return;
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length > 200) {
      res.status(400).json({ error: 'Description must be at most 200 characters' });
      return;
    }

    // 5. amount_kurus validation
    if (typeof amount_kurus !== 'number' || !Number.isInteger(amount_kurus) || amount_kurus <= 0) {
      res.status(400).json({ error: 'amount_kurus must be a positive integer' });
      return;
    }

    if (amount_kurus > 2147483647) {
      res.status(400).json({ error: 'amount_kurus is too large' });
      return;
    }

    // 6. paid_by validation
    if (typeof paid_by !== 'string' || !group.members.some((m) => m.userId === paid_by)) {
      res.status(400).json({ error: 'paid_by must be a member of the group' });
      return;
    }

    // Split calculation
    const memberIds = group.members.map((m) => m.userId);
    const n = memberIds.length;
    const base = Math.floor(amount_kurus / n);
    const remainder = amount_kurus - base * n;

    const splitsData = memberIds.map((userId) => ({
      userId,
      shareAmountKurus: base + (userId === paid_by ? remainder : 0),
    }));

    // Persist in transaction
    const expense = await prisma.$transaction(async (tx) => {
      const createdExpense = await tx.expense.create({
        data: {
          groupId,
          description: trimmedDescription,
          amountKurus: amount_kurus,
          paidBy: paid_by,
        },
      });

      // Insert splits
      if (splitsData.length > 0) {
        await tx.expenseSplit.createMany({
          data: splitsData.map((s) => ({
            expenseId: createdExpense.id,
            userId: s.userId,
            shareAmountKurus: s.shareAmountKurus,
          })),
        });
      }

      // Re-read with splits
      return tx.expense.findUnique({
        where: { id: createdExpense.id },
        include: { splits: true },
      });
    });

    if (!expense) {
      // Should not happen
      throw new Error('Failed to create expense');
    }

    res.status(201).json(formatExpense(expense));
  } catch (error) {
    console.error('POST /groups/:groupId/expenses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:groupId/expenses
router.get('/:groupId/expenses', requireAuth, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: true },
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    if (!group.members.some((m) => m.userId === req.userId)) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json(expenses.map(formatExpense));
  } catch (error) {
    console.error('GET /groups/:groupId/expenses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /:groupId/checklist
router.get('/:groupId/checklist', requireAuth, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: { select: { userId: true } },
        expenses: {
          include: { splits: true },
        },
        payments: {
          where: { status: 'CONFIRMED' },
          select: { fromUser: true, toUser: true, amountKurus: true },
        },
      },
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    if (!group.members.some((m) => m.userId === req.userId)) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }

    // Fetch pending payments for annotation
    const pendingPayments = await prisma.payment.findMany({
      where: { groupId, status: 'PENDING_CONFIRMATION' },
      select: { id: true, fromUser: true, toUser: true, amountKurus: true },
    });

    const memberIds = group.members.map((m) => m.userId);
    const expensesForBalance: ExpenseForBalance[] = group.expenses.map((e) => ({
      paidBy: e.paidBy,
      amountKurus: e.amountKurus,
      splits: e.splits.map((s) => ({ userId: s.userId, shareAmountKurus: s.shareAmountKurus })),
    }));

    const paymentsForBalance: PaymentForBalance[] = group.payments.map((p) => ({
      fromUser: p.fromUser,
      toUser: p.toUser,
      amountKurus: p.amountKurus,
    }));

    const balances = computeNetBalances(memberIds, expensesForBalance, paymentsForBalance);
    const checklist = simplifyDebts(balances, pendingPayments);

    res.status(200).json(checklist);
  } catch (error) {
    console.error('GET /groups/:groupId/checklist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /:groupId/payments – record a settlement
router.post('/:groupId/payments', requireAuth, async (req: Request, res: Response) => {
  try {
    const groupId = req.params.groupId;
    const { to_user, amount_kurus } = req.body;

    // 1. Fetch group with members, expenses, and CONFIRMED payments
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: true,
        expenses: {
          include: { splits: true },
        },
        payments: {
          where: { status: 'CONFIRMED' },
          select: { fromUser: true, toUser: true, amountKurus: true },
        },
      },
    });

    if (!group) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }

    // 2. Caller must be a member
    if (!group.members.some((m) => m.userId === req.userId)) {
      res.status(403).json({ error: 'You are not a member of this group' });
      return;
    }

    // 3. Group must not be closed
    if (group.status === 'CLOSED') {
      res.status(400).json({ error: 'Cannot settle in a closed group' });
      return;
    }

    // 4. Validate body
    if (typeof to_user !== 'string' || !group.members.some((m) => m.userId === to_user)) {
      res.status(400).json({ error: 'to_user must be a valid group member' });
      return;
    }
    if (typeof amount_kurus !== 'number' || !Number.isInteger(amount_kurus) || amount_kurus <= 0) {
      res.status(400).json({ error: 'amount_kurus must be a positive integer' });
      return;
    }
    if (to_user === req.userId) {
      res.status(400).json({ error: 'You cannot pay yourself' });
      return;
    }

    // 5. Verify exact checklist match
    const memberIds = group.members.map((m) => m.userId);
    const expensesForBalance: ExpenseForBalance[] = group.expenses.map((e) => ({
      paidBy: e.paidBy,
      amountKurus: e.amountKurus,
      splits: e.splits.map((s) => ({ userId: s.userId, shareAmountKurus: s.shareAmountKurus })),
    }));
    const paymentsForBalance: PaymentForBalance[] = group.payments.map((p) => ({
      fromUser: p.fromUser,
      toUser: p.toUser,
      amountKurus: p.amountKurus,
    }));
    const balances = computeNetBalances(memberIds, expensesForBalance, paymentsForBalance);
    const checklist = simplifyDebts(balances);

    const match = checklist.find(
      (c) => c.from_user === req.userId && c.to_user === to_user && c.amount_kurus === amount_kurus,
    );
    if (!match) {
      res.status(400).json({ error: 'Payment does not match the current checklist' });
      return;
    }

    // 6. Double-send protection
    const existing = await prisma.payment.findFirst({
      where: {
        groupId,
        fromUser: req.userId!,
        toUser: to_user,
        status: 'PENDING_CONFIRMATION',
      },
    });
    if (existing) {
      res.status(409).json({ error: 'A pending payment already exists for this pair' });
      return;
    }

    // 7. Create payment + notification in transaction (with race‑condition backstop)
    try {
      const payment = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            groupId,
            fromUser: req.userId!,
            toUser: to_user,
            amountKurus: amount_kurus,
            // status defaults to PENDING_CONFIRMATION
          },
        });

        await tx.notification.create({
          data: {
            userId: to_user,
            type: 'SETTLEMENT_CONFIRMATION_REQUEST',
            relatedPaymentId: payment.id,
          },
        });

        return payment;
      });

      res.status(201).json(formatPayment(payment));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        res.status(409).json({ error: 'A pending payment already exists for this pair' });
        return;
      }
      throw err; // let the outer catch handle it as a 500
    }
  } catch (error) {
    console.error('POST /groups/:groupId/payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
