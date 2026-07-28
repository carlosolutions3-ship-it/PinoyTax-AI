'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  Users,
  Calculator,
} from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { StatCard } from '@/components/stat-card';
import { CardSkeleton } from '@/components/skeleton';
import { useAuth } from '@/lib/auth-context';
import { complianceApi, companiesApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { Company, ComplianceStatus, FilingDeadline, FlaggedIssue, IssueStatus } from '@/lib/types';

const SEVERITY_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  low: 'slate',
  medium: 'amber',
  high: 'red',
  critical: 'red',
};

const DEADLINE_TONE: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  upcoming: 'blue',
  due_today: 'amber',
  overdue: 'red',
  filed: 'green',
};

const QUICK_ACTIONS = [
  { href: '/payroll', label: 'Run payroll', description: 'Process pay runs & payslips', icon: Users },
  { href: '/tax', label: 'Compute tax', description: 'BIR income tax, VAT & EWT', icon: Calculator },
  { href: '/documents', label: 'Upload document', description: 'Add receipts, filings & records', icon: FolderOpen },
  { href: '/ai-assistant', label: 'Ask AI assistant', description: 'Get instant tax guidance', icon: Sparkles },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function CompanyDashboardPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <DashboardContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function DashboardContent({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [status, setStatus] = useState<ComplianceStatus[]>([]);
  const [deadlines, setDeadlines] = useState<FilingDeadline[]>([]);
  const [issues, setIssues] = useState<FlaggedIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [companyRes, statusRes, deadlinesRes, issuesRes] = await Promise.all([
        companiesApi.getOne(companyId),
        complianceApi.getStatus(companyId),
        complianceApi.getDeadlines(companyId),
        complianceApi.getFlaggedIssues(companyId),
      ]);
      setCompany(companyRes);
      setStatus(statusRes);
      setDeadlines(deadlinesRes);
      setIssues(issuesRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load compliance data.');
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleScan() {
    setIsScanning(true);
    try {
      await complianceApi.runScan(companyId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Compliance scan failed.');
    } finally {
      setIsScanning(false);
    }
  }

  async function handleIssueStatus(issueId: string, next: IssueStatus) {
    try {
      const updated = await complianceApi.updateIssueStatus(companyId, issueId, next);
      setIssues((prev) => prev.map((i) => (i.id === issueId ? updated : i)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update issue.');
    }
  }

  const upcomingDeadlines = deadlines
    .filter((d) => d.status !== 'filed')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 8);

  const overdueCount = deadlines.filter((d) => d.status === 'overdue').length;
  const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'acknowledged');
  const avgCompliance =
    status.length > 0
      ? Math.round(status.reduce((sum, s) => sum + Number(s.compliancePercentage), 0) / status.length)
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {getGreeting()}
            {user ? `, ${user.firstName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {company ? company.businessName : 'Loading your business overview…'}
          </p>
        </div>
        <Button onClick={handleScan} isLoading={isScanning} variant="secondary">
          Run compliance scan
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {isLoading ? (
        <CardSkeleton count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Compliance score"
            value={avgCompliance !== null ? `${avgCompliance}%` : '—'}
            icon={ShieldCheck}
            tone={avgCompliance !== null && avgCompliance < 70 ? 'red' : 'brand'}
            helpText={status.length > 0 ? `Across ${status.length} categories` : 'Run a scan to get started'}
          />
          <StatCard
            label="Open issues"
            value={String(openIssues.length)}
            icon={AlertTriangle}
            tone={openIssues.length > 0 ? 'amber' : 'brand'}
            helpText={openIssues.length > 0 ? 'Needs your attention' : 'All clear'}
          />
          <StatCard
            label="Upcoming deadlines"
            value={String(upcomingDeadlines.length)}
            icon={CalendarClock}
            tone="accent"
            helpText="Next filings due"
          />
          <StatCard
            label="Overdue filings"
            value={String(overdueCount)}
            icon={AlertTriangle}
            tone={overdueCount > 0 ? 'red' : 'brand'}
            helpText={overdueCount > 0 ? 'Past due date' : 'Nothing overdue'}
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Quick actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={`/companies/${companyId}${action.href}`}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-popover"
              >
                <span className="inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-600 transition-colors group-hover:bg-brand-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 font-medium text-slate-900">{action.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{action.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {issues.length > 0 && (
        <Card>
          <h2 className="mb-4 font-semibold">Flagged issues by severity</h2>
          <BarChart
            data={(['critical', 'high', 'medium', 'low'] as const)
              .map((severity) => ({
                label: severity,
                value: issues.filter((i) => i.severity === severity).length,
                color: { critical: '#e11d48', high: '#dc2626', medium: '#d97706', low: '#64748b' }[severity],
              }))
              .filter((d) => d.value > 0)}
          />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Upcoming filing deadlines</h2>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-slate-500">No upcoming deadlines.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {upcomingDeadlines.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">
                      {d.formCode} <span className="text-slate-400">· {d.agency.toUpperCase()}</span>
                    </p>
                    <p className="text-xs text-slate-500">Due {formatDate(d.dueDate)}</p>
                  </div>
                  <Badge tone={DEADLINE_TONE[d.status]}>{d.status.replace('_', ' ')}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Flagged issues</h2>
          {openIssues.length === 0 ? (
            <p className="text-sm text-slate-500">No open issues. Nice work!</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {openIssues.map((issue) => (
                <li key={issue.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.severity}</Badge>
                      <p className="mt-1 text-sm">{issue.description}</p>
                      {issue.recommendedAction && (
                        <p className="mt-1 text-xs text-slate-500">{issue.recommendedAction}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" onClick={() => handleIssueStatus(issue.id, 'acknowledged')}>
                        Acknowledge
                      </Button>
                      <Button variant="ghost" onClick={() => handleIssueStatus(issue.id, 'resolved')}>
                        Resolve
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
