'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '', label: 'Dashboard' },
  { href: '/payroll', label: 'Payroll' },
  { href: '/tax', label: 'Tax' },
  { href: '/documents', label: 'Documents' },
  { href: '/ai-assistant', label: 'AI Assistant' },
  { href: '/settings', label: 'Settings' },
];

export function CompanyNav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const base = `/companies/${companyId}`;

  return (
    <nav className="mb-6 flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const isActive = pathname === href || (tab.href === '' && pathname === base);
        return (
          <Link
            key={tab.href}
            href={href}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              isActive
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
