'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Mail } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { useMyFirms } from '@/hooks/use-my-firms';
import { firmsApi, CreateFirmInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { omitEmptyStrings } from '@/lib/forms';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { CardSkeleton } from '@/components/skeleton';
import type { PendingFirmInvitation } from '@/lib/types';

const FIRM_ROLE_LABELS: Record<string, string> = {
  firm_owner: 'Firm owner',
  firm_admin: 'Firm admin',
  firm_accountant: 'Accountant',
  firm_bookkeeper: 'Bookkeeper',
  firm_auditor: 'Auditor',
};

const FIRM_TYPE_LABELS: Record<string, string> = {
  accounting_firm: 'Accounting firm',
  bookkeeping_firm: 'Bookkeeping firm',
  tax_consultancy: 'Tax consultancy',
};

export default function FirmsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <FirmsContent />
      </AppShell>
    </RequireAuth>
  );
}

function FirmsContent() {
  const { entries, isLoading, error, reload } = useMyFirms();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your firms</h1>
          <p className="text-sm text-slate-500">
            Manage multiple client companies under one firm, with staff invited once to the firm.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'Add firm'}</Button>
      </div>

      <PendingFirmInvitations onAccepted={reload} />

      {showCreate && (
        <CreateFirmForm
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
            title="No firms yet"
            description="Set up a firm to manage multiple client companies, invite staff once, and see your whole portfolio in one dashboard."
            action={<Button onClick={() => setShowCreate(true)}>Set up your first firm</Button>}
          />
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(({ firm, firmRole }) => (
          <Link key={firm.id} href={`/firms/${firm.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Briefcase className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 className="font-semibold">{firm.firmName}</h2>
                </div>
                <Badge tone="blue">{FIRM_ROLE_LABELS[firmRole] ?? firmRole}</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-500">{FIRM_TYPE_LABELS[firm.firmType] ?? firm.firmType}</p>
              <p className="text-xs text-slate-400">{firm.contactEmail}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CreateFirmForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<CreateFirmInput>({
    firmName: '',
    firmType: 'accounting_firm',
    contactEmail: '',
    contactNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await firmsApi.create(omitEmptyStrings(form) as CreateFirmInput);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create firm.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">New firm</h2>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label htmlFor="firmName">Firm name</Label>
          <Input
            id="firmName"
            required
            value={form.firmName}
            onChange={(e) => setForm({ ...form, firmName: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="firmType">Firm type</Label>
          <Select
            id="firmType"
            value={form.firmType}
            onChange={(e) => setForm({ ...form, firmType: e.target.value as CreateFirmInput['firmType'] })}
          >
            <option value="accounting_firm">Accounting firm</option>
            <option value="bookkeeping_firm">Bookkeeping firm</option>
            <option value="tax_consultancy">Tax consultancy</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="contactEmail">Contact email</Label>
          <Input
            id="contactEmail"
            type="email"
            required
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </Field>
        <Field>
          <Label htmlFor="contactNumber">Contact number (optional)</Label>
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
            Create firm
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PendingFirmInvitations({ onAccepted }: { onAccepted: () => void }) {
  const [invitations, setInvitations] = useState<PendingFirmInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await firmsApi.listMyInvitations();
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

  async function handleAccept(membershipId: string) {
    setAcceptingId(membershipId);
    try {
      await firmsApi.acceptInvitation(membershipId);
      setInvitations((prev) => prev.filter((i) => i.id !== membershipId));
      onAccepted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to accept invitation.');
    } finally {
      setAcceptingId(null);
    }
  }

  if (isLoading || invitations.length === 0) return null;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <h2 className="font-semibold text-slate-900">
          Pending firm invitation{invitations.length > 1 ? 's' : ''}
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
              <p className="font-medium text-slate-900">{invite.firm.firmName}</p>
              <p className="text-xs text-slate-500">
                Invited as {FIRM_ROLE_LABELS[invite.firmRole.code] ?? invite.firmRole.name}
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
