import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../db';
import { getActivationWindowMs } from '../lib/inviteConfig';
import { Prisma } from '@prisma/client';
import { formatGroup } from '../lib/formatGroup';

const router = Router();

router.post('/:token/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;

    const link = await prisma.inviteLink.findUnique({
      where: { token },
      include: { group: true },
    });

    if (!link) {
      res.status(404).json({ error: 'Invalid invite link' });
      return;
    }

    // Check if user is already a member — if so, silently succeed immediately
    // regardless of the link's or group's status (edge case: already-member no-op).
    const alreadyMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: link.groupId,
          userId: req.userId!,
        },
      },
    });

    if (alreadyMember) {
      res.status(200).json(formatGroup(link.group));
      return;
    }

    // Not a member – validate the link and group status
    if (link.status === 'EXPIRED') {
      res.status(410).json({ error: 'This invite link has expired' });
      return;
    }

    if (link.group.status === 'CLOSED') {
      res.status(410).json({ error: 'This group is closed' });
      return;
    }

    // Check PENDING window expiration
    if (link.status === 'PENDING') {
      const windowMs = getActivationWindowMs();
      const now = new Date();
      const expiresAt = new Date(link.createdAt.getTime() + windowMs);

      if (now > expiresAt) {
        await prisma.inviteLink.update({
          where: { id: link.id },
          data: { status: 'EXPIRED' },
        });
        res.status(410).json({ error: 'This invite link has expired' });
        return;
      }
    }

    // Link is usable (PENDING within window, or ACTIVE). Join inside a transaction.
    const group = await prisma.$transaction(async (tx) => {
      if (link.status === 'PENDING') {
        await tx.inviteLink.update({
          where: { id: link.id },
          data: { status: 'ACTIVE', activatedAt: new Date() },
        });
      }

      try {
        await tx.groupMember.create({
          data: {
            groupId: link.groupId,
            userId: req.userId!,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Duplicate membership – race with another request, treat as success
          // Continue to return the group
        } else {
          throw err;
        }
      }

      return tx.group.findUnique({
        where: { id: link.groupId },
      });
    });

    const groupToReturn = group ?? link.group;
    res.status(200).json(formatGroup(groupToReturn));
  } catch (error) {
    console.error('POST /invite-links/:token/accept error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
