'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase } from 'lucide-react';
import { companiesApi } from '@/lib/endpoints';

/**
 * Shown on company workspace pages when the company is managed by a firm,
 * so a firm staffer working here via a FirmCompanyAssignment (not a direct
 * company role) always sees which context they're in and a way back to the
 * firm's own dashboard — see FirmNav for the mirror-image indicator shown
 * on firm workspace pages.
 */
export function FirmContextBanner({ companyId }: { companyId: string }) {
  const [firm, setFirm] = useState<{ id: string; firmName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    companiesApi
      .getOne(companyId)
      .then((company) => {
        if (!cancelled) setFirm(company.firm ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!firm) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-2.5 text-sm text-indigo-800">
      <Briefcase className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>
        Managed by <span className="font-medium">{firm.firmName}</span>
      </span>
      <Link href={`/firms/${firm.id}`} className="ml-auto font-medium text-indigo-700 hover:text-indigo-900">
        Back to firm dashboard
      </Link>
    </div>
  );
}
