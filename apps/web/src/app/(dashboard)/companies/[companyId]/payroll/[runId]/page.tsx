'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/skeleton';
import { payrollApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import type { PayrollRunDetail, PayrollRunStatus } from '@/lib/types';

const RUN_STATUS_TONE: Record<PayrollRunStatus, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  draft: 'slate',
  processing: 'amber',
  finalized: 'blue',
  paid: 'green',
};

export default function PayrollRunPage() {
  const { companyId, runId } = useParams<{ companyId: string; runId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <PayrollRunContent companyId={companyId} runId={runId} />
      </AppShell>
    </RequireAuth>
  );
}

function PayrollRunContent({ companyId, runId }: { companyId: string; runId: string }) {
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await payrollApi.getRun(companyId, runId);
      setRun(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payroll run.');
    } finally {
      setIsLoading(false);
    }
  }, [companyId, runId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCompute() {
    setIsComputing(true);
    setError(null);
    try {
      await payrollApi.computeRun(companyId, runId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to compute payroll.');
    } finally {
      setIsComputing(false);
    }
  }

  async function handleFinalize() {
    setIsFinalizing(true);
    setError(null);
    try {
      await payrollApi.finalizeRun(companyId, runId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to finalize payroll run.');
    } finally {
      setIsFinalizing(false);
    }
  }

  const hasErrors = run?.payslips.some((p) => (p.computationSnapshot?.errors?.length ?? 0) > 0) ?? false;
  const canFinalize = run?.status === 'processing' && run.payslips.length > 0 && !hasErrors;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/companies/${companyId}/payroll`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            ← Back to payroll
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {run ? `${formatDate(run.periodStart)} – ${formatDate(run.periodEnd)}` : 'Payroll run'}
          </h1>
        </div>
        {run && <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>}
      </div>

      <ErrorText>{error}</ErrorText>

      {run && run.status !== 'finalized' && run.status !== 'paid' && (
        <div className="flex gap-2">
          <Button onClick={handleCompute} isLoading={isComputing}>
            {run.payslips.length > 0 ? 'Recompute payslips' : 'Compute payslips'}
          </Button>
          <Button onClick={handleFinalize} isLoading={isFinalizing} disabled={!canFinalize} variant="secondary">
            Finalize run
          </Button>
        </div>
      )}
      {run && hasErrors && (
        <p className="text-sm text-amber-700">
          Some payslips have unresolved errors below — resolve them (add missing employee numbers, configure
          missing tax rules) and recompute before finalizing.
        </p>
      )}

      <Card>
        <h2 className="mb-4 font-semibold">Payslips</h2>
        {isLoading ? (
          <TableSkeleton columns={7} />
        ) : run && run.payslips.length === 0 ? (
          <EmptyState
            title="No payslips yet"
            description={'Click "Compute payslips" to generate them for all active employees.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Basic pay</th>
                  <th className="py-2 pr-4">SSS</th>
                  <th className="py-2 pr-4">PhilHealth</th>
                  <th className="py-2 pr-4">Pag-IBIG</th>
                  <th className="py-2 pr-4">Withholding tax</th>
                  <th className="py-2 pr-4">Net pay</th>
                </tr>
              </thead>
              <tbody>
                {run?.payslips.map((p) => {
                  const errors = p.computationSnapshot?.errors ?? [];
                  return (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="py-2 pr-4 font-medium">
                        {p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : p.employeeId}
                        {errors.length > 0 && (
                          <p className="mt-1 text-xs font-normal text-red-600">{errors.join(', ')}</p>
                        )}
                      </td>
                      <td className="py-2 pr-4">{formatCurrency(p.basicPay)}</td>
                      <td className="py-2 pr-4">{formatCurrency(p.sssContribution)}</td>
                      <td className="py-2 pr-4">{formatCurrency(p.philhealthContribution)}</td>
                      <td className="py-2 pr-4">{formatCurrency(p.pagibigContribution)}</td>
                      <td className="py-2 pr-4">{formatCurrency(p.withholdingTax)}</td>
                      <td className="py-2 pr-4 font-semibold">{formatCurrency(p.netPay)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
