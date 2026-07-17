'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import React from 'react';
import { getGroup, createInviteLink, createPayment, ApiError } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import type { GroupDetail as GroupDetailType } from '@/lib/types';
import RequireAuth from '@/components/RequireAuth';
import Card from '@/components/Card';
import Button from '@/components/Button';

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <GroupDetail id={params.id} />
    </RequireAuth>
  );
}

function GroupDetail({ id }: { id: string }) {
  const router = useRouter();
  const myId = getUser()?.id ?? '';

  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [markingKeys, setMarkingKeys] = useState<Record<string, boolean>>({});
  const [markErrors, setMarkErrors] = useState<Record<string, string>>({});

  const load = async () => {
    setError(null);
    try {
      const g = await getGroup(id);
      setGroup(g);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not load group');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const nameOf = (userId: string): string => {
    if (userId === myId) return 'you';
    const m = group?.members.find((x) => x.user_id === userId);
    return m ? m.name : userId.slice(0, 8);
  };

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const handleGenerate = async () => {
    setInviteError(null);
    setGenerating(true);
    try {
      const r = await createInviteLink(id);
      setInviteUrl(`${window.location.origin}/invite/${r.token}`);
    } catch (err: unknown) {
      setInviteError(err instanceof ApiError ? err.message : 'Could not generate invite link');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div>
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b-[3px] border-ink">
        <Link href="/" className="font-mono text-lg">
          ←
        </Link>
        <h1 className="font-kalam text-2xl font-bold truncate">{group?.name}</h1>
      </div>

      <div className="max-w-md mx-auto p-4 flex flex-col gap-6">
        {/* Loading */}
        {group === null && !error && (
          <p className="font-mono text-sm text-inkMuted">Loading…</p>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col gap-2">
            <p className="text-debtor">{error}</p>
            <Link href="/" className="font-mono underline text-sm">
              Back to home
            </Link>
          </div>
        )}

        {group && (
          <>
            {/* Closed banner */}
            {group.status === 'CLOSED' && (
              <Card className="p-4">
                <p className="font-mono uppercase text-xs text-inkMuted">
                  This group is settled and archived.
                </p>
              </Card>
            )}

            {/* Owner-only invite */}
            {group.owner_id === myId && group.status === 'ACTIVE' && (
              <Card className="p-4 flex flex-col gap-3">
                <h2 className="font-mono uppercase text-xs tracking-wider text-inkSecondary">
                  Invite
                </h2>
                {!inviteUrl ? (
                  <Button disabled={generating} onClick={handleGenerate}>
                    Generate invite link
                  </Button>
                ) : (
                  <>
                    <input
                      readOnly
                      value={inviteUrl}
                      className="bg-transparent border-b-[3px] border-ink px-1 py-2 text-sm text-ink w-full"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button variant="link" onClick={handleCopy}>
                      {copied ? 'Copied!' : 'Copy link'}
                    </Button>
                  </>
                )}
                {inviteError && (
                  <p className="font-mono text-xs text-debtor">{inviteError}</p>
                )}
              </Card>
            )}

            {/* Add expense button */}
            {group.status === 'ACTIVE' && (
              <Link href={`/groups/${id}/expenses/new`}>
                <Button fullWidth>+ Add Expense</Button>
              </Link>
            )}

            {/* Expenses section */}
            <h2 className="font-mono uppercase text-xs tracking-wider text-inkSecondary">
              Expenses
            </h2>
            {group.expenses.length === 0 ? (
              <p className="text-inkMuted">No expenses yet.</p>
            ) : (
              <div className="flex flex-col gap-0">
                {group.expenses.map((e, idx) => (
                  <React.Fragment key={e.id}>
                    <div className="flex items-center justify-between py-2">
                      <span className="font-kalam text-ink">{e.description}</span>
                      <div className="text-right">
                        <span className="font-mono">{formatMoney(e.amount_kurus)}</span>
                        <p className="font-mono uppercase text-[10px] text-inkMuted">
                          paid by {nameOf(e.paid_by)}
                        </p>
                      </div>
                    </div>
                    {idx < group.expenses.length - 1 && (
                      <div className="border-b-[3px] border-divider" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Settle Up section */}
            <h2 className="font-mono uppercase text-xs tracking-wider text-inkSecondary">
              Settle Up
            </h2>
            {group.checklist.length === 0 ? (
              <p className="text-inkMuted">All settled up.</p>
            ) : (
              <div className="flex flex-col gap-0">
                {group.checklist.map((t, idx) => {
                  const rowKey = `${t.from_user}-${t.to_user}`;
                  const isMarking = markingKeys[rowKey] === true;
                  const showMark =
                    group.status === 'ACTIVE' &&
                    t.from_user === myId &&
                    t.pending_payment_id === null;

                  const handleMark = async () => {
                    setMarkingKeys((prev) => ({ ...prev, [rowKey]: true }));
                    setMarkErrors((prev) => ({ ...prev, [rowKey]: '' }));
                    try {
                      await createPayment(id, t.to_user, t.amount_kurus);
                      await load();
                    } catch (err: unknown) {
                      const msg =
                        err instanceof ApiError
                          ? err.message
                          : 'Could not mark as paid';
                      setMarkErrors((prev) => ({ ...prev, [rowKey]: msg }));
                    } finally {
                      setMarkingKeys((prev) => ({ ...prev, [rowKey]: false }));
                    }
                  };

                  return (
                    <React.Fragment
                      key={`${t.from_user}-${t.to_user}-${t.amount_kurus}`}
                    >
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <span className="font-mono text-sm">
                            {cap(nameOf(t.from_user))} → {nameOf(t.to_user)}
                          </span>
                          {t.pending_payment_id !== null && (
                            <span className="ml-2 font-mono uppercase text-[10px] text-inkMuted">
                              awaiting confirmation
                            </span>
                          )}
                        </div>
                        <span className="font-mono">{formatMoney(t.amount_kurus)}</span>
                      </div>

                      {showMark && (
                        <div className="pb-2">
                          <Button disabled={isMarking} onClick={handleMark}>
                            {isMarking ? 'Marking…' : 'Mark as paid'}
                          </Button>
                        </div>
                      )}

                      {markErrors[rowKey] && (
                        <p className="text-debtor font-mono text-xs pb-2">
                          {markErrors[rowKey]}
                        </p>
                      )}

                      {idx < group.checklist.length - 1 && (
                        <div className="border-b-[3px] border-divider" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
