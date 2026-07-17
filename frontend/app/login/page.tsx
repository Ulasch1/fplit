'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login, register, ApiError } from '@/lib/api';
import { setSession, isAuthenticated } from '@/lib/auth';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace(next);
    }
  }, [router, next]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp =
        mode === 'register'
          ? await register(email, password, name)
          : await login(email, password);
      setSession(resp);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-sm w-full p-8 flex flex-col gap-5">
        <h1 className="font-kalam text-4xl font-bold text-ink text-center">Fplit</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="font-mono text-xs text-debtor">{error}</p>}

          <Button type="submit" fullWidth disabled={loading}>
            {mode === 'login' ? 'Log In' : 'Sign Up'}
          </Button>
        </form>

        <p className="text-sm font-mono text-inkSecondary">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <Button
            variant="link"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </Button>
        </p>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
