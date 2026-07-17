'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite, ApiError } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import Button from '@/components/Button';
import Card from '@/components/Card';

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const token = params.token;
  const [status, setStatus] = useState<'checking' | 'ready' | 'joining'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?next=/invite/${encodeURIComponent(token)}`);
      return;
    }
    setStatus('ready');
  }, [router, token]);

  const handleJoin = async () => {
    setError(null);
    setStatus('joining');
    try {
      const group = await acceptInvite(token);
      router.replace(`/groups/${group.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join');
      setStatus('ready');
    }
  };

  if (status === 'checking') return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-sm w-full p-8 flex flex-col gap-5 text-center">
        <h1 className="font-kalam text-2xl font-bold text-ink">Join group</h1>
        <p className="text-inkSecondary">
          You&rsquo;ve been invited to join a group on Fplit.
        </p>
        {error && (
          <p className="font-mono text-xs text-debtor">{error}</p>
        )}
        <Button fullWidth disabled={status === 'joining'} onClick={handleJoin}>
          Join
        </Button>
        <Button variant="link" onClick={() => router.replace('/')}>
          Go to home
        </Button>
      </Card>
    </div>
  );
}
