'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Calculator } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/skeleton';
import { Pagination } from '@/components/pagination';
import { usePagination } from '@/hooks/use-pagination';
import { taxApi, ComputeTaxInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import type { ComputationStatus, ComputationType, TaxComputation } from '@/lib/types';

const TYPE_LABELS: Record<ComputationType, string> = {
  income_tax: 'Income tax',
  vat: 'VAT',
  percentage_tax: 'Percentage tax',
  ewt: 'Expanded withholding tax',
  withholding_comp: 'Withholding tax on compensation',
};

const STATUS_TONE: Record<ComputationStatus, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  draft: 'amber',
  confirmed: 'green',
};

export default function TaxPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <TaxContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function TaxContent({ companyId }: { companyId: string }) {
  const [computations, setComputations] = useState<TaxComputation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ComputationType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ComputationStatus | ''>('');
  // business_owner has no tax:compute permission at all (not even read —
  // see ADMIN_MANUAL.md's permission matrix), so the list fetch itself
  // 403s. Tracked separately from `error` so the page can hide the
  // "New computation" form (which would just 403 again on submit) instead
  // of showing a fully interactive form next to an error banner.
  const [isForbidden, setIsForbidden] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await taxApi.list(companyId);
      setComputations(result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setError(null);
      setIsForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setIsForbidden(true);
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load tax computations.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredComputations = computations.filter(
    (c) => (!typeFilter || c.computationType === typeFilter) && (!statusFilter || c.status === statusFilter),
  );
  const { page, setPage, totalPages, pageItems } = usePagination(filteredComputations, 10);

  async function handleConfirm(id: string) {
    setConfirmingId(id);
    try {
      const updated = await taxApi.confirm(companyId, id);
      setComputations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to confirm computation.');
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
          <Calculator className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tax computations</h1>
      </div>

      {isForbidden ? (
        <Card>
          <p className="text-sm text-slate-500">
            Your role doesn&apos;t have access to tax computations. An accountant, bookkeeper, or firm admin on this
            company can run and view them.
          </p>
        </Card>
      ) : (
        <>
          <ErrorText>{error}</ErrorText>

          <ComputeTaxForm companyId={companyId} onComputed={load} />

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">History</h2>
              {computations.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select
                    aria-label="Filter by type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as ComputationType | '')}
                    className="w-48"
                  >
                    <option value="">All types</option>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as ComputationStatus | '')}
                    className="w-36"
                  >
                    <option value="">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="confirmed">Confirmed</option>
                  </Select>
                </div>
              )}
            </div>
            {isLoading ? (
              <TableSkeleton columns={5} />
            ) : computations.length === 0 ? (
              <EmptyState title="No tax computations yet" description="Run your first computation above." />
            ) : filteredComputations.length === 0 ? (
              <EmptyState title="No matching computations" description="Try different filters." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Period</th>
                      <th className="py-2 pr-4">Result</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 align-top last:border-0">
                        <td className="py-2 pr-4 font-medium">{TYPE_LABELS[c.computationType]}</td>
                        <td className="py-2 pr-4 text-slate-500">
                          {formatDate(c.periodStart)} – {formatDate(c.periodEnd)}
                        </td>
                        <td className="py-2 pr-4">
                          {c.result != null ? (
                            <span className="font-semibold">{formatCurrency(c.result)}</span>
                          ) : (
                            <span className="text-slate-400">Not computed</span>
                          )}
                          {c.missingInputs.length > 0 && (
                            <p className="mt-1 text-xs text-amber-700">{c.missingInputs.join('; ')}</p>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {c.status === 'draft' && c.result != null && (
                            <Button
                              variant="ghost"
                              onClick={() => handleConfirm(c.id)}
                              isLoading={confirmingId === c.id}
                            >
                              Confirm
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4">
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    onChange={setPage}
                    totalItems={filteredComputations.length}
                    pageSize={10}
                  />
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

type NumericField = 'grossSales' | 'grossReceipts' | 'businessExpenses' | 'payrollExpenses' | 'otherDeductions';

const FIELDS_BY_TYPE: Record<ComputationType, NumericField[]> = {
  vat: ['grossSales', 'grossReceipts'],
  percentage_tax: ['grossSales', 'grossReceipts'],
  ewt: ['businessExpenses'],
  withholding_comp: ['payrollExpenses'],
  income_tax: ['grossSales', 'grossReceipts', 'businessExpenses', 'otherDeductions'],
};

const FIELD_LABELS: Record<NumericField, string> = {
  grossSales: 'Gross sales',
  grossReceipts: 'Gross receipts',
  businessExpenses: 'Business expenses / income payments subject to EWT',
  payrollExpenses: 'Payroll expenses (taxable compensation)',
  otherDeductions: 'Other allowable deductions',
};

function ComputeTaxForm({ companyId, onComputed }: { companyId: string; onComputed: () => void }) {
  const today = new Date();
  const [computationType, setComputationType] = useState<ComputationType>('vat');
  const [periodStart, setPeriodStart] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [periodEnd, setPeriodEnd] = useState(
    new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TaxComputation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const relevantFields = FIELDS_BY_TYPE[computationType];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (periodEnd < periodStart) {
      setError('Period end must be on or after period start.');
      return;
    }
    setIsSubmitting(true);
    try {
      const numericFields: Partial<Record<NumericField, number>> = {};
      for (const field of relevantFields) {
        const raw = amounts[field];
        if (raw !== undefined && raw !== '') {
          numericFields[field] = Number(raw);
        }
      }
      const input: ComputeTaxInput = { computationType, periodStart, periodEnd, ...numericFields };
      const computed = await taxApi.compute(companyId, input);
      setResult(computed);
      onComputed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to compute tax.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">New computation</h2>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
        <Field>
          <Label htmlFor="computationType">Computation type</Label>
          <Select
            id="computationType"
            value={computationType}
            onChange={(e) => {
              setComputationType(e.target.value as ComputationType);
              setResult(null);
            }}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="periodStart">Period start</Label>
          <Input
            id="periodStart"
            type="date"
            required
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="periodEnd">Period end</Label>
          <Input
            id="periodEnd"
            type="date"
            required
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </Field>

        {relevantFields.map((field) => (
          <Field key={field}>
            <Label htmlFor={field}>{FIELD_LABELS[field]}</Label>
            <Input
              id={field}
              type="number"
              min={0}
              step="0.01"
              value={amounts[field] ?? ''}
              onChange={(e) => setAmounts({ ...amounts, [field]: e.target.value })}
            />
          </Field>
        ))}

        <div className="sm:col-span-3">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" isLoading={isSubmitting}>
            Compute
          </Button>
        </div>
      </form>

      {result && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          {result.result != null ? (
            <p className="text-lg font-semibold">{formatCurrency(result.result)}</p>
          ) : (
            <p className="text-sm text-amber-700">Could not compute a result — see missing inputs below.</p>
          )}
          {result.missingInputs.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-amber-700">
              {result.missingInputs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
