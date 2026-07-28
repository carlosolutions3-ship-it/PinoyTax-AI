'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from './button';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/companies" className="text-lg font-semibold text-brand-700">
              PinoyTax AI
            </Link>
            <Link href="/notifications" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Notifications
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-slate-600">
                {user.firstName} {user.lastName}
              </span>
            )}
            <Button variant="ghost" onClick={() => logout()}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
