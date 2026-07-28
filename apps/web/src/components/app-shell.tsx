'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Building2, FileText, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Logo, LogoMark } from './brand/logo';
import { Avatar } from './avatar';

const NAV_LINKS = [
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/forms', label: 'Forms library', icon: FileText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const links = user?.isPlatformAdmin ? [...NAV_LINKS, { href: '/admin', label: 'Admin', icon: ShieldCheck }] : NAV_LINKS;

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-5">
        <Link href="/companies">
          <Logo />
        </Link>
        <button
          type="button"
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsMobileNavOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-slate-200 p-3">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-100"
            onClick={() => setIsMobileNavOpen(false)}
          >
            <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-800">
                {user.firstName} {user.lastName}
              </span>
              <span className="block truncate text-xs text-slate-500">{user.email}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar (slide-over) */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setIsMobileNavOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-popover">{sidebarContent}</aside>
        </div>
      )}

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          onClick={() => setIsMobileNavOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/companies">
          <LogoMark className="h-7 w-7" />
        </Link>
        <span className="w-7" />
      </header>

      <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
