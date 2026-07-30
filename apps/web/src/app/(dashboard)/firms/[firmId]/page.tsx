'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, AlertTriangle, CheckCircle2, Sparkles, CalendarClock } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { FirmNav } from '@/components/firm-nav';
import { Badge, Card, ErrorText } from '@/components/ui';
import { StatCard } from '@/components/stat-card';
import { EmptyState } from '@/components/empty-state';
import { CardSkeleton, TableSkeleton } from '@/components/skeleton';
import { firmsApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { FirmDashboard } from '@/lib/types';

const AGENCY_LABELS: Record<string, string> = {
  bir: 'BIR',
  sss: 'SSS',
  philhealth: 'PhilHealth',
  pagibig: 'Pag-IBIG',
  lgu: 'LGU',
};

const DEADLINE_STATUS_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  upcoming: 'blue',
  due_today: 'amber',
  overdue: 'red',
  filed: 'green',
};

export default function FirmDashboardPage() {
  const { firmId } = useParams<{ firmId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <FirmDashboardContent firmId={firmId} />
      </AppShell>
    </RequireAuth>
  );
}

function FirmDashboardContent({ firmId }: { firmId: string }) {
  const [dashboard, setDashboard] = useState<FirmDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await firmsApi.getDashboard(firmId);
      setDashboard(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the firm dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <FirmNav firmId={firmId} firmName={dashboard?.firm.firmName} />

      <ErrorText>{error}</ErrorText>

      {isLoading && (
        <div className="flex flex-col gap-6">
          <CardSkeleton />
          <Card>
            <TableSkeleton rows={3} columns={4} />
          </Card>
        </div>
      )}

      {!isLoading && dashboard && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Client companies" value={String(dashboard.totals.totalClients)} icon={Building2} tone="brand" />
            <StatCard
              label="Avg. compliance"
              value={`${dashboard.totals.avgCompliancePercentage}%`}
              icon={CheckCircle2}
              tone="accent"
            />
            <StatCard
              label="Overdue filings"
              value={String(dashboard.totals.totalOverdueFilings)}
              icon={CalendarClock}
              tone={dashboard.totals.totalOverdueFilings > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              label="Critical issues open"
              value={String(dashboard.totals.totalOpenCriticalIssues)}
              icon={AlertTriangle}
              tone={dashboard.totals.totalOpenCriticalIssues > 0 ? 'red' : 'slate'}
            />
          </div>

          {dashboard.aiInsight && (
            <Card className="border-indigo-200 bg-indigo-50/40">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Portfolio insight</p>
                  <p className="mt-1 text-sm text-slate-700">{dashboard.aiInsight}</p>
                </div>
              </div>
            </Card>
          )}

          <Card padded={false}>
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Clients</h2>
            </div>
            {dashboard.clients.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No clients yet"
                  description="Add a client company from the Clients tab to start tracking their compliance here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Client</th>
                      <th className="px-6 py-3 font-medium">Compliance</th>
                      <th className="px-6 py-3 font-medium">Overdue</th>
                      <th className="px-6 py-3 font-medium">Open issues</th>
                      <th className="px-6 py-3 font-medium">Latest payroll</th>
                      <th className="px-6 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashboard.clients.map((client) => {
                      const criticalOrHigh = client.openIssuesBySeverity.critical + client.openIssuesBySeverity.high;
                      return (
                        <tr key={client.id}>
                          <td className="px-6 py-3">
                            <p className="font-medium text-slate-900">{client.businessName}</p>
                            {client.tradeName && <p className="text-xs text-slate-500">{client.tradeName}</p>}
                          </td>
                          <td className="px-6 py-3">
                            <Badge tone={client.compliancePercentage >= 80 ? 'green' : client.compliancePercentage >= 50 ? 'amber' : 'red'}>
                              {client.compliancePercentage}%
                            </Badge>
                          </td>
                          <td className="px-6 py-3">
                            {client.overdueFilings > 0 ? (
                              <Badge tone="red">{client.overdueFilings} overdue</Badge>
                            ) : (
                              <span className="text-slate-400">None</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {criticalOrHigh > 0 ? (
                              <Badge tone="red">{criticalOrHigh} critical/high</Badge>
                            ) : (
                              <span className="text-slate-400">None</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-slate-600">
                            {client.latestPayrollRun
                              ? `${client.latestPayrollRun.status} · ${formatDate(client.latestPayrollRun.periodEnd)}`
                              : '—'}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <Link
                              href={`/firms/${firmId}/clients/${client.id}/assignments`}
                              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              Manage access
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-semibold text-slate-900">Upcoming deadlines across the portfolio</h2>
            </div>
            {dashboard.upcomingDeadlines.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No upcoming deadlines" description="Nothing due soon across any client." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.upcomingDeadlines.map((deadline) => (
                  <li key={deadline.id} className="flex items-center justify-between px-6 py-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">
                        {deadline.companyName} — {AGENCY_LABELS[deadline.agency] ?? deadline.agency} {deadline.formCode}
                      </p>
                      <p className="text-xs text-slate-500">Due {formatDate(deadline.dueDate)}</p>
                    </div>
                    <Badge tone={DEADLINE_STATUS_TONE[deadline.status] ?? 'slate'}>{deadline.status.replace('_', ' ')}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
