import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../db';
import { formatPayment } from '../lib/formatPayment';

const router = Router();

// GET / – list current user's notifications
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        include: { payment: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const formatted = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      related_payment_id: n.relatedPaymentId,
      is_read: n.isRead,
      created_at: n.createdAt,
      payment: formatPayment(n.payment),
    }));

    res.status(200).json({
      notifications: formatted,
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error('GET /notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /:id/read – mark a notification as read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (notification.userId !== req.userId) {
      res.status(403).json({ error: 'This notification does not belong to you' });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.status(200).json({
      id: updated.id,
      type: updated.type,
      related_payment_id: updated.relatedPaymentId,
      is_read: updated.isRead,
      created_at: updated.createdAt,
    });
  } catch (error) {
    console.error('PATCH /notifications/:id/read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
