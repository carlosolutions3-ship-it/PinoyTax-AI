'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { useMyCompanies } from '@/hooks/use-my-companies';
import { companiesApi, CreateCompanyInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { omitEmptyStrings } from '@/lib/forms';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { CardSkeleton } from '@/components/skeleton';
import type { PendingInvitation } from '@/lib/types';

const ROLE_LABELS: Record<string, string> = {
  accountant: 'Accountant',
  bookkeeper: 'Bookkeeper',
  firm_admin: 'Firm admin',
  business_owner: 'Business owner',
  administrator: 'Administrator',
};

export default function CompaniesPage() {
  return (
    <RequireAuth>
      <AppShell>
        <CompaniesContent />
      </AppShell>
    </RequireAuth>
  );
}

function CompaniesContent() {
  const { entries, isLoading, error, reload } = useMyCompanies();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your companies</h1>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : 'Add company'}
        </Button>
      </div>

      <PendingInvitations onAccepted={reload} />

      {showCreate && (
        <CreateCompanyForm
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}

      <ErrorText>{error}</ErrorText>

      {isLoading && <CardSkeleton />}

      {!isLoading && entries.length === 0 && !showCreate && (
        <Card>
          <EmptyState
            title="No companies yet"
            description="Add your business to start tracking payroll, taxes, and compliance."
            action={<Button onClick={() => setShowCreate(true)}>Add your first company</Button>}
          />
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(({ company, role }) => (
          <Link key={company.id} href={`/companies/${company.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <h2 className="font-semibold">{company.businessName}</h2>
                <Badge tone="blue">{role.replace('_', ' ')}</Badge>
              </div>
              {company.tradeName && <p className="text-sm text-slate-500">{company.tradeName}</p>}
              <div className="mt-3 flex gap-2">
                <Badge tone={company.vatClassification === 'vat' ? 'green' : 'slate'}>
                  {company.vatClassification === 'vat' ? 'VAT registered' : 'Non-VAT'}
                </Badge>
                <Badge tone="slate">{company.businessType.replace('_', ' ')}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CreateCompanyForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<CreateCompanyInput>({
    businessName: '',
    tradeName: '',
    businessType: 'sole_prop',
    vatClassification: 'non_vat',
    tin: '',
    rdoCode: '',
    businessAddress: '',
    email: '',
    contactNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await companiesApi.create(omitEmptyStrings(form) as CreateCompanyInput);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create company.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">New company</h2>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            required
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="tradeName">Trade name (optional)</Label>
          <Input
            id="tradeName"
            value={form.tradeName}
            onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="businessType">Business type</Label>
          <Select
            id="businessType"
            value={form.businessType}
            onChange={(e) => setForm({ ...form, businessType: e.target.value as CreateCompanyInput['businessType'] })}
          >
            <option value="sole_prop">Sole Proprietorship</option>
            <option value="opc">One Person Corporation</option>
            <option value="partnership">Partnership</option>
            <option value="corporation">Corporation</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="vatClassification">VAT classification</Label>
          <Select
            id="vatClassification"
            value={form.vatClassification}
            onChange={(e) =>
              setForm({ ...form, vatClassification: e.target.value as CreateCompanyInput['vatClassification'] })
            }
          >
            <option value="non_vat">Non-VAT</option>
            <option value="vat">VAT registered</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="tin">TIN (000-000-000)</Label>
          <Input
            id="tin"
            required
            placeholder="123-456-789"
            value={form.tin}
            onChange={(e) => setForm({ ...form, tin: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="rdoCode">RDO code (optional)</Label>
          <Input
            id="rdoCode"
            value={form.rdoCode}
            onChange={(e) => setForm({ ...form, rdoCode: e.target.value })}
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
        <Field>
          <Label htmlFor="contactNumber">Contact number</Label>
          <Input
            id="contactNumber"
            value={form.contactNumber}
            onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" isLoading={isSubmitting}>
            Create company
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PendingInvitations({ onAccepted }: { onAccepted: () => void }) {
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await companiesApi.listMyInvitations();
      setInvitations(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load invitations.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAccept(invitationId: string) {
    setAcceptingId(invitationId);
    try {
      await companiesApi.acceptInvitation(invitationId);
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      onAccepted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to accept invitation.');
    } finally {
      setAcceptingId(null);
    }
  }

  if (isLoading || invitations.length === 0) return null;

  return (
    <Card className="border-accent-200 bg-accent-50/40">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-accent-600" aria-hidden="true" />
        <h2 className="font-semibold text-slate-900">
          Pending invitation{invitations.length > 1 ? 's' : ''}
        </h2>
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="flex flex-col gap-2">
        {invitations.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-slate-900">
                {invite.company.businessName}
                {invite.company.tradeName ? ` (${invite.company.tradeName})` : ''}
              </p>
              <p className="text-xs text-slate-500">
                Invited as {ROLE_LABELS[invite.role.code] ?? invite.role.name}
                {invite.invitedBy ? ` by ${invite.invitedBy.firstName} ${invite.invitedBy.lastName}` : ''} ·{' '}
                {formatDate(invite.invitedAt)}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => handleAccept(invite.id)}
              isLoading={acceptingId === invite.id}
              className="self-start sm:self-auto"
            >
              Accept
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
