'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { FirmContextBanner } from '@/components/firm-context-banner';
import { Badge, Card } from '@/components/ui';
import { BarChart, ProgressBar } from '@/components/charts';
import { CardSkeleton } from '@/components/skeleton';
import { StatCard } from '@/components/stat-card';
import { complianceApi, payrollApi, taxApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import type { ComplianceStatus, ComputationType, PayrollRun, PayrollRunDetail, TaxComputation } from '@/lib/types';

const TAX_TYPE_LABELS: Record<ComputationType, string> = {
  income_tax: 'Income tax',
  vat: 'VAT',
  percentage_tax: 'Percentage tax',
  ewt: 'Expanded withholding tax',
  withholding_comp: 'Withholding tax on compensation',
};

export default function ReportsPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <FirmContextBanner companyId={companyId} />
        <ReportsContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function ReportsContent({ companyId }: { companyId: string }) {
  const [finalizedRuns, setFinalizedRuns] = useState<PayrollRunDetail[]>([]);
  const [taxComputations, setTaxComputations] = useState<TaxComputation[]>([]);
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [payrollForbidden, setPayrollForbidden] = useState(false);
  const [taxForbidden, setTaxForbidden] = useState(false);
  const [complianceForbidden, setComplianceForbidden] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    // Settled independently — a role that can see compliance data but not
    // tax computations (e.g. business_owner) should still see the sections
    // it has access to, rather than one 403 blanking out every section via
    // a shared Promise.all rejection.
    const [runsResult, computationsResult, statusResult] = await Promise.allSettled([
      payrollApi.listRuns(companyId),
      taxApi.list(companyId),
      complianceApi.getStatus(companyId),
    ]);

    if (runsResult.status === 'fulfilled') {
      setPayrollForbidden(false);
      // Only finalized/paid runs represent settled payroll — draft/processing
      // runs can still change and would skew totals.
      const settled = runsResult.value.filter((r: PayrollRun) => r.status === 'finalized' || r.status === 'paid');
      const details = await Promise.all(settled.map((r) => payrollApi.getRun(companyId, r.id)));
      setFinalizedRuns(details);
    } else {
      setPayrollForbidden(runsResult.reason instanceof ApiError && runsResult.reason.status === 403);
    }

    if (computationsResult.status === 'fulfilled') {
      setTaxForbidden(false);
      setTaxComputations(computationsResult.value);
    } else {
      setTaxForbidden(computationsResult.reason instanceof ApiError && computationsResult.reason.status === 403);
    }

    if (statusResult.status === 'fulfilled') {
      setComplianceForbidden(false);
      setComplianceStatus(statusResult.value);
    } else {
      setComplianceForbidden(statusResult.reason instanceof ApiError && statusResult.reason.status === 403);
    }

    setIsLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const payrollTotals = finalizedRuns.reduce(
    (acc, run) => {
      for (const p of run.payslips) {
        acc.grossPay += Number(p.grossPay);
        acc.totalDeductions += Number(p.totalDeductions);
        acc.netPay += Number(p.netPay);
        acc.sss += Number(p.sssContribution);
        acc.philhealth += Number(p.philhealthContribution);
        acc.pagibig += Number(p.pagibigContribution);
        acc.withholdingTax += Number(p.withholdingTax);
      }
      return acc;
    },
    { grossPay: 0, totalDeductions: 0, netPay: 0, sss: 0, philhealth: 0, pagibig: 0, withholdingTax: 0 },
  );

  const confirmedTax = taxComputations.filter((c) => c.status === 'confirmed' && c.result != null);
  const taxByType = confirmedTax.reduce<Record<string, number>>((acc, c) => {
    acc[c.computationType] = (acc[c.computationType] ?? 0) + Number(c.result);
    return acc;
  }, {});
  const totalConfirmedTax = Object.values(taxByType).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reports</h1>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">Payroll summary (finalized runs)</h2>
        {isLoading ? (
          <CardSkeleton count={4} />
        ) : payrollForbidden ? (
          <p className="text-sm text-slate-500">Your role doesn&apos;t have access to payroll data.</p>
        ) : finalizedRuns.length === 0 ? (
          <p className="text-sm text-slate-500">No finalized payroll runs yet.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total gross pay" value={formatCurrency(payrollTotals.grossPay)} />
              <StatCard label="Total deductions" value={formatCurrency(payrollTotals.totalDeductions)} />
              <StatCard label="Total net pay" value={formatCurrency(payrollTotals.netPay)} />
              <StatCard label="Total withholding tax" value={formatCurrency(payrollTotals.withholdingTax)} />
            </div>
            <div className="mt-4">
              <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Net pay by period</h3>
              <BarChart
                data={finalizedRuns.map((run) => ({
                  label: formatDate(run.periodStart),
                  value: run.payslips.reduce((sum, p) => sum + Number(p.netPay), 0),
                  color: '#1d4ed8',
                }))}
                formatValue={formatCurrency}
              />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Period</th>
                    <th className="py-2 pr-4">Employees paid</th>
                    <th className="py-2 pr-4">Gross pay</th>
                    <th className="py-2 pr-4">Net pay</th>
                  </tr>
                </thead>
                <tbody>
                  {finalizedRuns.map((run) => (
                    <tr key={run.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4">
                        {formatDate(run.periodStart)} – {formatDate(run.periodEnd)}
                      </td>
                      <td className="py-2 pr-4 text-slate-500">{run.payslips.length}</td>
                      <td className="py-2 pr-4">
                        {formatCurrency(run.payslips.reduce((sum, p) => sum + Number(p.grossPay), 0))}
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {formatCurrency(run.payslips.reduce((sum, p) => sum + Number(p.netPay), 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Tax summary (confirmed computations)</h2>
        {isLoading ? (
          <CardSkeleton count={1} />
        ) : taxForbidden ? (
          <p className="text-sm text-slate-500">Your role doesn&apos;t have access to tax data.</p>
        ) : confirmedTax.length === 0 ? (
          <p className="text-sm text-slate-500">No confirmed tax computations yet.</p>
        ) : (
          <>
            <StatCard label="Total confirmed tax" value={formatCurrency(totalConfirmedTax)} />
            <div className="mt-4">
              <BarChart
                data={Object.entries(taxByType).map(([type, total]) => ({
                  label: TAX_TYPE_LABELS[type as ComputationType] ?? type,
                  value: total,
                }))}
                formatValue={formatCurrency}
              />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(taxByType).map(([type, total]) => (
                    <tr key={type} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4">{TAX_TYPE_LABELS[type as ComputationType] ?? type}</td>
                      <td className="py-2 pr-4 font-medium">{formatCurrency(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Compliance summary</h2>
        {isLoading ? (
          <CardSkeleton count={4} />
        ) : complianceForbidden ? (
          <p className="text-sm text-slate-500">Your role doesn&apos;t have access to compliance data.</p>
        ) : complianceStatus.length === 0 ? (
          <p className="text-sm text-slate-500">
            No compliance data yet — run a compliance scan from the dashboard.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {complianceStatus.map((s) => (
              <Card key={s.id} className="bg-slate-50">
                <p className="text-xs uppercase tracking-wide text-slate-500">{s.category}</p>
                <p className="mt-1 text-2xl font-semibold">{s.compliancePercentage}%</p>
                <div className="mt-2">
                  <ProgressBar
                    value={Number(s.compliancePercentage)}
                    color={s.overdueCount > 0 ? '#dc2626' : Number(s.compliancePercentage) < 70 ? '#d97706' : '#16a34a'}
                    label={`${s.category}: ${s.compliancePercentage}% compliant`}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone="green">{s.completedCount} done</Badge>
                  <Badge tone="amber">{s.pendingCount} pending</Badge>
                  {s.overdueCount > 0 && <Badge tone="red">{s.overdueCount} overdue</Badge>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
