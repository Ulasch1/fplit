'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, FormEvent } from 'react';
import { getGroup, addExpense, ApiError } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { dollarsToKurus } from '@/lib/format';
import type { GroupDetail as GroupDetailType } from '@/lib/types';
import RequireAuth from '@/components/RequireAuth';
import Input from '@/components/Input';
import Button from '@/components/Button';

export default function AddExpensePage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <AddExpense id={params.id} />
    </RequireAuth>
  );
}

function AddExpense({ id }: { id: string }) {
  const router = useRouter();
  const myId = getUser()?.id ?? '';

  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadGroup() {
      try {
        const g = await getGroup(id);
        if (cancelled) return;
        setGroup(g);
        // default payer: current user if a member, else first member
        const defaultPayer = g.members.some((m) => m.user_id === myId)
          ? myId
          : g.members[0]?.user_id ?? '';
        setPaidBy(defaultPayer);
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Could not load group');
        }
      }
    }
    loadGroup();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const desc = description.trim();
    if (!desc) {
      setError('Description is required');
      return;
    }

    const kurus = dollarsToKurus(amount);
    if (kurus === null) {
      setError('Enter a valid amount greater than 0');
      return;
    }

    if (!paidBy) {
      setError('Select who paid');
      return;
    }

    setSaving(true);
    try {
      await addExpense(id, desc, kurus, paidBy);
      router.replace(`/groups/${id}`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not add expense');
    } finally {
      setSaving(false);
    }
  };

  const backUrl = `/groups/${id}`;

  return (
    <div>
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b-[3px] border-ink">
        <Link href={backUrl} className="font-mono text-lg">
          ←
        </Link>
        <h1 className="font-kalam text-2xl font-bold">Add Expense</h1>
      </div>

      <div className="max-w-md mx-auto p-4">
        {group === null && !loadError && (
          <p className="font-mono text-sm text-inkMuted">Loading…</p>
        )}

        {loadError && (
          <div className="flex flex-col gap-2">
            <p className="text-debtor">{loadError}</p>
            <Link href={backUrl} className="font-mono underline text-sm">
              Back to group
            </Link>
          </div>
        )}

        {group && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              label="Description"
              placeholder="e.g. Dinner"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Input
              label="Amount ($)"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <div className="flex flex-col gap-1">
              <label
                htmlFor="paid-by"
                className="font-mono uppercase text-xs tracking-wider text-inkSecondary"
              >
                Paid By
              </label>
              <select
                id="paid-by"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                className="bg-transparent border-b-[3px] border-ink px-1 py-2 text-ink"
              >
                {group.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === myId ? 'You' : m.name}
                  </option>
                ))}
              </select>
            </div>

            <p className="font-mono text-[10px] uppercase text-inkMuted">
              All group members are automatically included.
            </p>

            {error && <p className="font-mono text-xs text-debtor">{error}</p>}

            <Button type="submit" fullWidth disabled={saving}>
              Save
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
