'use client';

import { useState, FormEvent } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@pemandu.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof TypeError
          ? 'Cannot reach the backend API. Make sure the backend is running on port 4000.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-white">
            <span className="text-lg font-medium">G</span>
          </div>
          <h1 className="text-lg font-medium">GHG emission tracking</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your organization&apos;s workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-center text-xs text-gray-400">
            Demo: admin@pemandu.test / ChangeMe123! (after running the seed script)
          </p>
        </form>
      </div>
    </div>
  );
}

// This page renders outside the (app) route group's AuthProvider (see app/(app)/layout.tsx),
// so it wraps its own provider — login is the one screen that must work with no session yet.
export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
