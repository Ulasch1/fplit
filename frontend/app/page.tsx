'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { listGroups, createGroup, listNotifications, ApiError } from '@/lib/api';
import { clearSession } from '@/lib/auth';
import RequireAuth from '@/components/RequireAuth';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';
import StatusBadge from '@/components/StatusBadge';
import type { GroupSummary } from '@/lib/types';

function Home() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    setError(null);
    try {
      const gs = await listGroups();
      setGroups(gs);
    } catch (err) {
      setGroups([]);
      setError(err instanceof ApiError ? err.message : 'Failed to load groups');
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const fetchUnread = useCallback(async () => {
    try {
      const { unread_count } = await listNotifications();
      setUnreadCount(unread_count);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    const handleFocus = () => {
      fetchUnread();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUnread();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUnread]);

  const handleLogout = () => {
    clearSession();
    router.replace('/login');
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError('Name is required');
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      await createGroup(trimmed);
      setShowCreate(false);
      setNewName('');
      await loadGroups();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create group');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 flex justify-between items-center px-4 py-3 border-b-[3px] border-ink bg-paper">
        <span className="font-kalam text-2xl font-bold text-ink">Fplit</span>
        <div className="flex items-center gap-3">
          <Link
            href="/notifications"
            aria-label="Notifications"
            className="font-mono text-sm text-ink hover:underline underline-offset-4"
          >
            🔔 {unreadCount > 0 && <span>{unreadCount}</span>}
          </Link>
          <Button variant="link" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 flex flex-col gap-4">
        <Button onClick={() => setShowCreate(true)} fullWidth>
          + New Group
        </Button>

        {showCreate && (
          <Card className="p-4 flex flex-col gap-3">
            <Input
              label="Group name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="link" onClick={() => { setShowCreate(false); setNewName(''); setCreateError(null); }}>
                Cancel
              </Button>
              <Button disabled={creating} onClick={handleCreate}>
                Create
              </Button>
            </div>
            {createError && (
              <p className="font-mono text-xs text-debtor">{createError}</p>
            )}
          </Card>
        )}

        {groups === null && (
          <p className="font-mono text-sm text-inkMuted">Loading…</p>
        )}

        {error && groups !== null && (
          <p className="font-mono text-sm text-debtor">{error}</p>
        )}

        {groups !== null && groups.length === 0 && !error && (
          <p className="text-inkMuted font-kalam text-lg">
            No groups yet. Create one to get started.
          </p>
        )}

        {groups?.map((g) => (
          <Link key={g.id} href={`/groups/${g.id}`} className="block">
            <Card
              className={`p-4 flex items-center gap-3 hover:-translate-y-[1px] transition-transform${
                g.status === 'CLOSED' ? ' opacity-70' : ''
              }`}
            >
              <div className="w-10 h-10 flex items-center justify-center border-[3px] border-ink bg-accent text-white font-mono font-bold rotate-[-4deg] rounded-[4px]">
                {g.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="font-kalam text-lg text-ink">{g.name}</span>
                <StatusBadge netKurus={g.net_balance_kurus} closed={g.status === 'CLOSED'} />
              </div>
            </Card>
          </Link>
        ))}
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <Home />
    </RequireAuth>
  );
}
