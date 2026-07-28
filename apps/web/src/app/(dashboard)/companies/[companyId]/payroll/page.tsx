'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Payroll</h1>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
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

        {!isLoading && employees.length === 0 ? (
          <p className="text-sm text-slate-500">No employees yet. Add one to start running payroll.</p>
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
                {employees.map((e) => (
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
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Payroll runs</h2>
          <Button variant="secondary" onClick={() => setShowCreateRun((v) => !v)}>
            {showCreateRun ? 'Cancel' : 'New payroll run'}
          </Button>
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

        {!isLoading && runs.length === 0 ? (
          <p className="text-sm text-slate-500">No payroll runs yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/companies/${companyId}/payroll/${run.id}`}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-sm hover:bg-slate-50"
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
