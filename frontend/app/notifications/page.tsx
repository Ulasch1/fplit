'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import RequireAuth from '@/components/RequireAuth';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import { listNotifications, resolvePayment, getGroup, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { NotificationItem, RejectionReason, GroupDetail } from '@/lib/types';

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Notifications />
    </RequireAuth>
  );
}

function Notifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groupInfoMap, setGroupInfoMap] = useState<
    Record<string, { name: string; memberName: (userId: string) => string } | null>
  >({});

  const [rejectOpenFor, setRejectOpenFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<RejectionReason>('WRONG_AMOUNT');
  const [rejectNote, setRejectNote] = useState('');

  const [submittingIds, setSubmittingIds] = useState<Record<string, boolean>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNotifications();
      setNotifications(data.notifications);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Resolve group names when notifications change
  useEffect(() => {
    if (notifications.length === 0) {
      setGroupInfoMap({});
      return;
    }
    const groupIds = Array.from(new Set(notifications.map((n) => n.payment.group_id)));
    Promise.allSettled(groupIds.map((id) => getGroup(id))).then((results) => {
      const map: Record<string, { name: string; memberName: (userId: string) => string } | null> = {};
      groupIds.forEach((id, idx) => {
        const res = results[idx];
        if (res.status === 'fulfilled') {
          const g: GroupDetail = res.value;
          map[id] = {
            name: g.name,
            memberName: (uid: string) => {
              const m = g.members.find((member) => member.user_id === uid);
              return m ? m.name : uid.slice(0, 8);
            },
          };
        } else {
          map[id] = null; // fallback for failed group fetch
        }
      });
      setGroupInfoMap(map);
    });
  }, [notifications]);

  // Retrieve payer name and group name for a notification, with fallbacks
  const getPayerName = (n: NotificationItem) => {
    const info = groupInfoMap[n.payment.group_id];
    if (info) return info.memberName(n.payment.from_user);
    return n.payment.from_user.slice(0, 8);
  };

  const getGroupName = (n: NotificationItem) => {
    const info = groupInfoMap[n.payment.group_id];
    return info ? info.name : n.payment.group_id.slice(0, 8);
  };

  const handleApprove = async (n: NotificationItem) => {
    const nid = n.id;
    setCardErrors((prev) => ({ ...prev, [nid]: '' }));
    setSubmittingIds((prev) => ({ ...prev, [nid]: true }));
    try {
      await resolvePayment(n.payment.id, 'CONFIRM');
      await loadNotifications();
    } catch (err: unknown) {
      setCardErrors((prev) => ({
        ...prev,
        [nid]: err instanceof ApiError ? err.message : 'Something went wrong',
      }));
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [nid]: false }));
    }
  };

  const openRejectPicker = (n: NotificationItem) => {
    setRejectOpenFor(n.id);
    setRejectReason('WRONG_AMOUNT');
    setRejectNote('');
    setCardErrors((prev) => ({ ...prev, [n.id]: '' }));
  };

  const closeRejectPicker = () => {
    setRejectOpenFor(null);
    setRejectNote('');
  };

  const handleRejectSubmit = async (n: NotificationItem) => {
    if (rejectReason === 'OTHER' && rejectNote.trim() === '') {
      setCardErrors((prev) => ({
        ...prev,
        [n.id]: 'A note is required for Other.',
      }));
      return;
    }
    const nid = n.id;
    setCardErrors((prev) => ({ ...prev, [nid]: '' }));
    setSubmittingIds((prev) => ({ ...prev, [nid]: true }));
    try {
      await resolvePayment(
        n.payment.id,
        'REJECT',
        rejectReason,
        rejectReason === 'OTHER' ? rejectNote.trim() : undefined
      );
      await loadNotifications();
      closeRejectPicker();
    } catch (err: unknown) {
      setCardErrors((prev) => ({
        ...prev,
        [nid]: err instanceof ApiError ? err.message : 'Something went wrong',
      }));
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [nid]: false }));
    }
  };

  const reasonLabel = (reason: RejectionReason | null) => {
    if (!reason) return null;
    switch (reason) {
      case 'WRONG_AMOUNT':
        return 'Wrong amount';
      case 'FORGOT':
        return 'I wasn’t paid';
      case 'OTHER':
        return 'Other';
      default:
        return reason;
    }
  };

  return (
    <div>
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b-[3px] border-ink">
        <Link href="/" className="font-mono text-lg">
          ←
        </Link>
        <h1 className="font-kalam text-2xl font-bold">Notifications</h1>
      </div>

      <main className="max-w-md mx-auto p-4 flex flex-col gap-4">
        {/* Loading */}
        {loading && (
          <p className="font-mono text-sm text-inkMuted">Loading…</p>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col gap-2">
            <p className="text-debtor">{error}</p>
            <Link href="/" className="font-mono underline text-sm">
              Back to home
            </Link>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && notifications.length === 0 && (
          <p className="font-kalam text-inkMuted">No notifications yet.</p>
        )}

        {/* Notifications list */}
        {!loading && !error && notifications.length > 0 && (
          <>
            {notifications.map((n) => {
              const payerName = getPayerName(n);
              const groupName = getGroupName(n);
              const isSubmitting = submittingIds[n.id] === true;
              const cardError = cardErrors[n.id];

              return (
                <Card
                  key={n.id}
                  className={`p-4 flex flex-col gap-3 ${n.is_read ? 'opacity-60' : ''}`}
                >
                  {/* Message */}
                  <p className="font-kalam text-ink">
                    {payerName} marked they paid you {formatMoney(n.payment.amount_kurus)} in{' '}
                    {groupName}.
                  </p>

                  {/* Actions / Status */}
                  {!n.is_read && n.payment.status === 'PENDING_CONFIRMATION' && (
                    <div className="flex gap-4 items-center">
                      <Button
                        variant="link"
                        disabled={isSubmitting}
                        onClick={() => handleApprove(n)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="link"
                        disabled={isSubmitting}
                        onClick={() => openRejectPicker(n)}
                      >
                        Reject
                      </Button>
                    </div>
                  )}

                  {n.payment.status === 'CONFIRMED' && (
                    <p className="font-mono uppercase text-xs text-inkMuted">
                      ✓ you confirmed
                    </p>
                  )}

                  {n.payment.status === 'REJECTED' && (
                    <div className="flex flex-col gap-1">
                      <p className="font-mono uppercase text-xs text-debtor">
                        ✗ you rejected
                      </p>
                      {n.payment.rejection_reason && (
                        <p className="font-mono text-xs text-debtor">
                          {reasonLabel(n.payment.rejection_reason)}
                          {n.payment.rejection_reason === 'OTHER' &&
                            n.payment.rejection_note &&
                            `: "${n.payment.rejection_note}"`}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Inline Reject Picker */}
                  {rejectOpenFor === n.id && (
                    <div className="flex flex-col gap-3 border-t-[3px] border-ink pt-3">
                      <select
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value as RejectionReason)}
                        className="bg-transparent border-b-[3px] border-ink px-1 py-2 text-sm font-mono text-ink focus:outline-none focus:border-accent"
                      >
                        <option value="WRONG_AMOUNT">Wrong amount</option>
                        <option value="FORGOT">I wasn’t paid</option>
                        <option value="OTHER">Other</option>
                      </select>

                      {rejectReason === 'OTHER' && (
                        <Input
                          label="Note"
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          placeholder="Required for Other"
                          required
                          className="w-full"
                        />
                      )}

                      <div className="flex gap-4">
                        <Button
                          variant="primary"
                          disabled={isSubmitting}
                          onClick={() => handleRejectSubmit(n)}
                        >
                          Submit
                        </Button>
                        <Button
                          variant="link"
                          disabled={isSubmitting}
                          onClick={closeRejectPicker}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Per-card error */}
                  {cardError && (
                    <p className="font-mono text-xs text-debtor">{cardError}</p>
                  )}
                </Card>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
