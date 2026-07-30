'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/skeleton';
import { SearchInput } from '@/components/search-input';
import { Pagination } from '@/components/pagination';
import { usePagination } from '@/hooks/use-pagination';
import { payrollApi, CreateEmployeeInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Employee, PayrollRun, PayrollRunStatus } from '@/lib/types';

const RUN_STATUS_TONE: Record<PayrollRunStatus, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  draft: 'slate',
  processing: 'amber',
  finalized: 'blue',
  paid: 'green',
};

export default function PayrollPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <PayrollContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function PayrollContent({ companyId }: { companyId: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showCreateRun, setShowCreateRun] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState<PayrollRunStatus | ''>('');

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [employeesRes, runsRes] = await Promise.all([
        payrollApi.listEmployees(companyId),
        payrollApi.listRuns(companyId),
      ]);
      setEmployees(employeesRes);
      setRuns(runsRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payroll data.');
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filteredEmployees = employees.filter((e) => {
    if (!employeeSearch.trim()) return true;
    const q = employeeSearch.trim().toLowerCase();
    return `${e.firstName} ${e.lastName}`.toLowerCase().includes(q);
  });
  const {
    page: employeePage,
    setPage: setEmployeePage,
    totalPages: employeeTotalPages,
    pageItems: employeePageItems,
  } = usePagination(filteredEmployees, 10);

  const filteredRuns = runs.filter((r) => !runStatusFilter || r.status === runStatusFilter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
          <Users className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payroll</h1>
      </div>
      <ErrorText>{error}</ErrorText>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Employees</h2>
          <Button variant="secondary" onClick={() => setShowAddEmployee((v) => !v)}>
            {showAddEmployee ? 'Cancel' : 'Add employee'}
          </Button>
        </div>

        {showAddEmployee && (
          <AddEmployeeForm
            companyId={companyId}
            onCreated={() => {
              setShowAddEmployee(false);
              loadAll();
            }}
          />
        )}

        {!isLoading && employees.length > 0 && (
          <div className="mb-4">
            <SearchInput
              placeholder="Search employees by name…"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
        )}

        {isLoading ? (
          <TableSkeleton columns={7} />
        ) : employees.length === 0 ? (
          <EmptyState title="No employees yet" description="Add your first employee to start running payroll." />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState title="No matching employees" description="Try a different search term." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">SSS</th>
                  <th className="py-2 pr-4">PhilHealth</th>
                  <th className="py-2 pr-4">Pag-IBIG</th>
                  <th className="py-2 pr-4">Basic salary</th>
                  <th className="py-2 pr-4">Frequency</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {employeePageItems.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {e.firstName} {e.lastName}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{e.sssNumber ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{e.philhealthNumber ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{e.pagibigNumber ?? '—'}</td>
                    <td className="py-2 pr-4">{formatCurrency(e.basicSalary)}</td>
                    <td className="py-2 pr-4 text-slate-500">{e.payFrequency.replace('_', '-')}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={e.employmentStatus === 'active' ? 'green' : 'slate'}>
                        {e.employmentStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4">
              <Pagination
                page={employeePage}
                totalPages={employeeTotalPages}
                onChange={setEmployeePage}
                totalItems={filteredEmployees.length}
                pageSize={10}
              />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Payroll runs</h2>
          <div className="flex items-center gap-2">
            {runs.length > 0 && (
              <Select
                aria-label="Filter by status"
                value={runStatusFilter}
                onChange={(e) => setRunStatusFilter(e.target.value as PayrollRunStatus | '')}
                className="w-40"
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="processing">Processing</option>
                <option value="finalized">Finalized</option>
                <option value="paid">Paid</option>
              </Select>
            )}
            <Button variant="secondary" onClick={() => setShowCreateRun((v) => !v)}>
              {showCreateRun ? 'Cancel' : 'New payroll run'}
            </Button>
          </div>
        </div>

        {showCreateRun && (
          <CreateRunForm
            companyId={companyId}
            onCreated={() => {
              setShowCreateRun(false);
              loadAll();
            }}
          />
        )}

        {isLoading ? (
          <TableSkeleton rows={3} columns={2} />
        ) : runs.length === 0 ? (
          <EmptyState title="No payroll runs yet" description="Create a run to process pay for this period." />
        ) : filteredRuns.length === 0 ? (
          <EmptyState title="No matching runs" description="Try a different status filter." />
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/companies/${companyId}/payroll/${run.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                >
                  <span>
                    {formatDate(run.periodStart)} – {formatDate(run.periodEnd)}
                  </span>
                  <Badge tone={RUN_STATUS_TONE[run.status]}>{run.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AddEmployeeForm({ companyId, onCreated }: { companyId: string; onCreated: () => void }) {
  const [form, setForm] = useState<CreateEmployeeInput>({
    firstName: '',
    lastName: '',
    tin: '',
    sssNumber: '',
    philhealthNumber: '',
    pagibigNumber: '',
    dateHired: new Date().toISOString().slice(0, 10),
    basicSalary: 0,
    payFrequency: 'monthly',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await payrollApi.createEmployee(companyId, form);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add employee.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-2">
      <Field>
        <Label htmlFor="firstName">First name</Label>
        <Input
          id="firstName"
          required
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="lastName">Last name</Label>
        <Input
          id="lastName"
          required
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="sssNumber">SSS number</Label>
        <Input
          id="sssNumber"
          value={form.sssNumber}
          onChange={(e) => setForm({ ...form, sssNumber: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="philhealthNumber">PhilHealth number</Label>
        <Input
          id="philhealthNumber"
          value={form.philhealthNumber}
          onChange={(e) => setForm({ ...form, philhealthNumber: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="pagibigNumber">Pag-IBIG number</Label>
        <Input
          id="pagibigNumber"
          value={form.pagibigNumber}
          onChange={(e) => setForm({ ...form, pagibigNumber: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="tin">TIN</Label>
        <Input id="tin" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
      </Field>
      <Field>
        <Label htmlFor="dateHired">Date hired</Label>
        <Input
          id="dateHired"
          type="date"
          required
          value={form.dateHired}
          onChange={(e) => setForm({ ...form, dateHired: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="basicSalary">Basic salary (monthly)</Label>
        <Input
          id="basicSalary"
          type="number"
          min={0}
          step="0.01"
          required
          value={form.basicSalary}
          onChange={(e) => setForm({ ...form, basicSalary: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <Label htmlFor="payFrequency">Pay frequency</Label>
        <Select
          id="payFrequency"
          value={form.payFrequency}
          onChange={(e) => setForm({ ...form, payFrequency: e.target.value as CreateEmployeeInput['payFrequency'] })}
        >
          <option value="monthly">Monthly</option>
          <option value="semi_monthly">Semi-monthly</option>
          <option value="weekly">Weekly</option>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" isLoading={isSubmitting}>
          Add employee
        </Button>
      </div>
    </form>
  );
}

function CreateRunForm({ companyId, onCreated }: { companyId: string; onCreated: () => void }) {
  const today = new Date();
  const [periodStart, setPeriodStart] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [periodEnd, setPeriodEnd] = useState(
    new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (periodEnd < periodStart) {
      setError('Period end must be on or after period start.');
      return;
    }
    setIsSubmitting(true);
    try {
      await payrollApi.createRun(companyId, { periodStart, periodEnd });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create payroll run.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-3">
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
        <Input id="periodEnd" type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" isLoading={isSubmitting}>
          Create run
        </Button>
      </div>
      <div className="sm:col-span-3">
        <ErrorText>{error}</ErrorText>
      </div>
    </form>
  );
}
