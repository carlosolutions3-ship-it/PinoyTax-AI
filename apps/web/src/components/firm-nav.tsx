'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, Users, Settings, Briefcase } from 'lucide-react';

const TABS = [
  { href: '', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Building2 },
  { href: '/staff', label: 'Staff', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/**
 * Sub-nav for firm workspace pages. Deliberately uses an indigo accent
 * (vs. the brand-emerald used throughout company workspace pages) so a
 * "Firm workspace" vs. "Company workspace" screen reads as visually
 * distinct at a glance — see AppShell's matching indigo firm-context banner.
 */
export function FirmNav({ firmId, firmName }: { firmId: string; firmName?: string }) {
  const pathname = usePathname();
  const base = `/firms/${firmId}`;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
        <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
        Firm workspace{firmName ? ` · ${firmName}` : ''}
      </div>
      <nav className="-mx-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => {
            const href = `${base}${tab.href}`;
            const isActive = pathname === href || (tab.href === '' && pathname === base);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={href}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
