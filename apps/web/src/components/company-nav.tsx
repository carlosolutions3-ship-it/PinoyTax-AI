'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Calculator,
  FolderOpen,
  Sparkles,
  BarChart3,
  ShieldCheck,
  Settings,
} from 'lucide-react';

const TABS = [
  { href: '', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/payroll', label: 'Payroll', icon: Users },
  { href: '/tax', label: 'Tax', icon: Calculator },
  { href: '/documents', label: 'Documents', icon: FolderOpen },
  { href: '/ai-assistant', label: 'AI Assistant', icon: Sparkles },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/roles', label: 'Roles', icon: ShieldCheck },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function CompanyNav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const base = `/companies/${companyId}`;

  return (
    <nav className="mb-6 -mx-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
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
                  ? 'border-brand-600 text-brand-700'
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
  );
}
