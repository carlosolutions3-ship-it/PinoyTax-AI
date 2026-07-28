'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText } from '@/components/ui';
import { BarChart, ProgressBar } from '@/components/charts';
import { complianceApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import type { ComplianceStatus, FilingDeadline, FlaggedIssue, IssueStatus } from '@/lib/types';

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
  const [status, setStatus] = useState<ComplianceStatus[]>([]);
  const [deadlines, setDeadlines] = useState<FilingDeadline[]>([]);
  const [issues, setIssues] = useState<FlaggedIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statusRes, deadlinesRes, issuesRes] = await Promise.all([
        complianceApi.getStatus(companyId),
        complianceApi.getDeadlines(companyId),
        complianceApi.getFlaggedIssues(companyId),
      ]);
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

  const openIssues = issues.filter((i) => i.status === 'open' || i.status === 'acknowledged');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compliance dashboard</h1>
        <Button onClick={handleScan} isLoading={isScanning} variant="secondary">
          Run compliance scan
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {status.length === 0 && !isLoading && (
          <Card className="sm:col-span-2 lg:col-span-4 text-sm text-slate-500">
            No compliance status yet — run a compliance scan to generate your filing calendar.
          </Card>
        )}
        {status.map((s) => (
          <Card key={s.id}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{s.category}</p>
            <p className="mt-1 text-2xl font-semibold">{s.compliancePercentage}%</p>
            <div className="mt-2">
              <ProgressBar
                value={Number(s.compliancePercentage)}
                color={s.overdueCount > 0 ? '#e11d48' : '#1d4ed8'}
                label={`${s.compliancePercentage}% complete`}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {s.completedCount} completed · {s.pendingCount} pending · {s.overdueCount} overdue
            </p>
          </Card>
        ))}
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
                    <p className="text-xs text-slate-500">Due {new Date(d.dueDate).toLocaleDateString()}</p>
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
