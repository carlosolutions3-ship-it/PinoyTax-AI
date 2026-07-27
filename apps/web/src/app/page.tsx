'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? '/companies' : '/login');
  }, [isLoading, user, router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
}
