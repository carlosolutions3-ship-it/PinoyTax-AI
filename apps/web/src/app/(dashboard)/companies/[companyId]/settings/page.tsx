'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { companiesApi, UpdateCompanyInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import type { Company } from '@/lib/types';

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
      <h1 className="text-2xl font-semibold">Company settings</h1>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      <ErrorText>{error}</ErrorText>

      {company && <CompanyProfileForm company={company} onSaved={setCompany} />}

      <InviteStaffForm companyId={companyId} />
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
      const updated = await companiesApi.update(company.id, form);
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

function InviteStaffForm({ companyId }: { companyId: string }) {
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState<'accountant' | 'bookkeeper'>('accountant');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      await companiesApi.inviteStaff(companyId, { email, roleCode });
      setSuccessMessage(`Invitation sent to ${email}.`);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send invitation.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Invite staff</h2>
      <p className="mb-4 text-sm text-slate-500">
        Invite an accountant or bookkeeper. They must already have a PinoyTax AI account — ask them to register
        first if they don&apos;t.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <Field>
          <Label htmlFor="inviteEmail">Email</Label>
          <Input
            id="inviteEmail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="roleCode">Role</Label>
          <Select id="roleCode" value={roleCode} onChange={(e) => setRoleCode(e.target.value as 'accountant' | 'bookkeeper')}>
            <option value="accountant">Accountant</option>
            <option value="bookkeeper">Bookkeeper</option>
          </Select>
        </Field>
        <Button type="submit" isLoading={isSubmitting}>
          Send invitation
        </Button>
      </form>
      <div className="mt-2 flex flex-col gap-1">
        <ErrorText>{error}</ErrorText>
        {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
      </div>
    </Card>
  );
}
