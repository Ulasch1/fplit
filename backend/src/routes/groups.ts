import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../db';

const router = Router();

// Helper: map internal group fields to snake_case JSON
function formatGroup(group: {
  id: string;
  name: string;
  ownerId: string;
  status: string;
  createdAt: Date;
}) {
  return {
    id: group.id,
    name: group.name,
    owner_id: group.ownerId,
    status: group.status,
    created_at: group.createdAt,
  };
}

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

    const groups = memberships.map((m) => ({
      ...formatGroup(m.group),
      net_balance_kurus: 0, // real calculation in M6
    }));

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

    res.status(200).json({
      ...formatGroup(group),
      members: membersList,
      expenses: [], // real list in M5
      checklist: [], // real calculation in M6
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

export default router;
