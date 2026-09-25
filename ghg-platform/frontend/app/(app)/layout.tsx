'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';

function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-gray-400">Loading…</div>;
  }
  if (!user) return null; // brief flash before the redirect above fires

  return (
    <div className="flex min-h-screen flex-col md:h-screen md:flex-row print:block print:h-auto">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 print:overflow-visible print:p-0">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
