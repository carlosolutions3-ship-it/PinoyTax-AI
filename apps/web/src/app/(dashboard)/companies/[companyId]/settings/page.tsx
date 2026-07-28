'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Settings as SettingsIcon } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { CardSkeleton, TableSkeleton } from '@/components/skeleton';
import { branchesApi, companiesApi, CreateBranchInput, UpdateCompanyInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { omitEmptyStrings } from '@/lib/forms';
import { Badge } from '@/components/ui';
import type { Branch, Company } from '@/lib/types';

export default function SettingsPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <SettingsContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function SettingsContent({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await companiesApi.getOne(companyId);
      setCompany(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load company.');
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-soft">
            <SettingsIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Company settings</h1>
        </div>
        <Link
          href={`/companies/${companyId}/roles`}
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Manage staff roles &amp; permissions →
        </Link>
      </div>
      <ErrorText>{error}</ErrorText>

      {isLoading ? <CardSkeleton count={1} /> : company && <CompanyProfileForm company={company} onSaved={setCompany} />}

      <BranchesSection companyId={companyId} />
    </div>
  );
}

function CompanyProfileForm({ company, onSaved }: { company: Company; onSaved: (c: Company) => void }) {
  const [form, setForm] = useState<UpdateCompanyInput>({
    tradeName: company.tradeName ?? '',
    vatClassification: company.vatClassification,
    rdoCode: company.rdoCode ?? '',
    businessAddress: company.businessAddress ?? '',
    email: company.email ?? '',
    contactNumber: company.contactNumber ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const updated = await companiesApi.update(company.id, omitEmptyStrings(form) as UpdateCompanyInput);
      onSaved(updated);
      setSuccessMessage('Company profile updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update company.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Business profile</h2>
      <p className="mb-4 text-sm text-slate-500">
        {company.businessName} · TIN {company.tin} · {company.businessType.replace('_', ' ')}
      </p>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label htmlFor="tradeName">Trade name</Label>
          <Input
            id="tradeName"
            value={form.tradeName}
            onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="vatClassification">VAT classification</Label>
          <Select
            id="vatClassification"
            value={form.vatClassification}
            onChange={(e) =>
              setForm({ ...form, vatClassification: e.target.value as UpdateCompanyInput['vatClassification'] })
            }
          >
            <option value="non_vat">Non-VAT</option>
            <option value="vat">VAT registered</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="rdoCode">RDO code</Label>
          <Input id="rdoCode" value={form.rdoCode} onChange={(e) => setForm({ ...form, rdoCode: e.target.value })} />
        </Field>
        <Field>
          <Label htmlFor="contactNumber">Contact number</Label>
          <Input
            id="contactNumber"
            value={form.contactNumber}
            onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="email">Business email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="businessAddress">Business address</Label>
          <Input
            id="businessAddress"
            value={form.businessAddress}
            onChange={(e) => setForm({ ...form, businessAddress: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2 flex flex-col gap-2">
          <ErrorText>{error}</ErrorText>
          {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" isLoading={isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function BranchesSection({ companyId }: { companyId: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await branchesApi.list(companyId);
      setBranches(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load branches.');
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(branch: Branch) {
    setTogglingId(branch.id);
    try {
      const nextStatus = branch.status === 'active' ? 'inactive' : 'active';
      const updated = await branchesApi.update(companyId, branch.id, { status: nextStatus });
      setBranches((prev) => prev.map((b) => (b.id === branch.id ? updated : b)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update branch.');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Branches</h2>
        <Button variant="secondary" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancel' : 'Add branch'}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>

      {showAdd && (
        <AddBranchForm
          companyId={companyId}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {isLoading ? (
        <TableSkeleton rows={2} columns={2} />
      ) : branches.length === 0 ? (
        <EmptyState
          title="No branches yet"
          description="This company operates from its main address only."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {branches.map((branch) => (
            <li
              key={branch.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{branch.branchName}</p>
                <p className="text-xs text-slate-500">
                  {branch.branchAddress ?? 'No address on file'}
                  {branch.rdoCode ? ` · RDO ${branch.rdoCode}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={branch.status === 'active' ? 'green' : 'slate'}>{branch.status}</Badge>
                <Button variant="ghost" onClick={() => toggleStatus(branch)} isLoading={togglingId === branch.id}>
                  {branch.status === 'active' ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AddBranchForm({ companyId, onCreated }: { companyId: string; onCreated: () => void }) {
  const [form, setForm] = useState<CreateBranchInput>({ branchName: '', branchAddress: '', rdoCode: '' });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await branchesApi.create(companyId, omitEmptyStrings(form) as CreateBranchInput);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add branch.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 grid gap-4 rounded-md border border-slate-200 p-4 sm:grid-cols-3">
      <Field>
        <Label htmlFor="branchName">Branch name</Label>
        <Input
          id="branchName"
          required
          value={form.branchName}
          onChange={(e) => setForm({ ...form, branchName: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="branchAddress">Address</Label>
        <Input
          id="branchAddress"
          value={form.branchAddress}
          onChange={(e) => setForm({ ...form, branchAddress: e.target.value })}
        />
      </Field>
      <Field>
        <Label htmlFor="branchRdoCode">RDO code</Label>
        <Input
          id="branchRdoCode"
          value={form.rdoCode}
          onChange={(e) => setForm({ ...form, rdoCode: e.target.value })}
        />
      </Field>
      <div className="sm:col-span-3">
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" isLoading={isSubmitting}>
          Add branch
        </Button>
      </div>
    </form>
  );
}

