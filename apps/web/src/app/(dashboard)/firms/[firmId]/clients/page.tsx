'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { FirmNav } from '@/components/firm-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/skeleton';
import { firmsApi, CreateCompanyInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { omitEmptyStrings } from '@/lib/forms';
import type { Company } from '@/lib/types';

export default function FirmClientsPage() {
  const { firmId } = useParams<{ firmId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <FirmNav firmId={firmId} />
        <FirmClientsContent firmId={firmId} />
      </AppShell>
    </RequireAuth>
  );
}

function FirmClientsContent({ firmId }: { firmId: string }) {
  const [clients, setClients] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'create' | 'invite'>('none');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await firmsApi.listClientCompanies(firmId);
      setClients(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load client companies.');
    } finally {
      setIsLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRemove(companyId: string) {
    if (!confirm('Remove this client from the firm? Firm staff will lose access to it immediately.')) return;
    setRemovingId(companyId);
    try {
      await firmsApi.removeClientCompany(firmId, companyId);
      setClients((prev) => prev.filter((c) => c.id !== companyId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove client.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Client companies</h1>
          <p className="text-sm text-slate-500">Onboard a new client, or invite an existing company to engage this firm.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMode(mode === 'invite' ? 'none' : 'invite')}>
            {mode === 'invite' ? 'Cancel' : 'Invite existing company'}
          </Button>
          <Button onClick={() => setMode(mode === 'create' ? 'none' : 'create')}>
            {mode === 'create' ? 'Cancel' : 'New client'}
          </Button>
        </div>
      </div>

      {mode === 'create' && (
        <CreateClientForm
          firmId={firmId}
          onCreated={() => {
            setMode('none');
            load();
          }}
        />
      )}
      {mode === 'invite' && <InviteExistingCompanyForm firmId={firmId} onInvited={() => setMode('none')} />}

      <ErrorText>{error}</ErrorText>

      <Card padded={false}>
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton columns={4} />
          </div>
        ) : clients.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No clients yet" description="Onboard your first client company above." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-medium">Business name</th>
                  <th className="px-6 py-3 font-medium">TIN</th>
                  <th className="px-6 py-3 font-medium">VAT status</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {c.businessName}
                      {c.tradeName && <span className="ml-1 font-normal text-slate-500">({c.tradeName})</span>}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{c.tin}</td>
                    <td className="px-6 py-3">
                      <Badge tone={c.vatClassification === 'vat' ? 'green' : 'slate'}>
                        {c.vatClassification === 'vat' ? 'VAT registered' : 'Non-VAT'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-4">
                        <Link
                          href={`/firms/${firmId}/clients/${c.id}/assignments`}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Manage access
                        </Link>
                        <Link href={`/companies/${c.id}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                          Open
                        </Link>
                        <button
                          type="button"
                          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                          disabled={removingId === c.id}
                          onClick={() => handleRemove(c.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CreateClientForm({ firmId, onCreated }: { firmId: string; onCreated: () => void }) {
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
      await firmsApi.createClientCompany(firmId, omitEmptyStrings(form) as CreateCompanyInput);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create client company.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold">New client company</h2>
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
          <Input id="tradeName" value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
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
            onChange={(e) => setForm({ ...form, vatClassification: e.target.value as CreateCompanyInput['vatClassification'] })}
          >
            <option value="non_vat">Non-VAT</option>
            <option value="vat">VAT registered</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="tin">TIN (000-000-000)</Label>
          <Input id="tin" required placeholder="123-456-789" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
        </Field>
        <Field>
          <Label htmlFor="rdoCode">RDO code (optional)</Label>
          <Input id="rdoCode" value={form.rdoCode} onChange={(e) => setForm({ ...form, rdoCode: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" isLoading={isSubmitting}>
            Create client
          </Button>
        </div>
      </form>
    </Card>
  );
}

function InviteExistingCompanyForm({ firmId, onInvited }: { firmId: string; onInvited: () => void }) {
  const [tin, setTin] = useState('');
  const [found, setFound] = useState<{ id: string; businessName: string; firmId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setFound(null);
    setIsLookingUp(true);
    try {
      const result = await firmsApi.lookupCompanyByTin(firmId, tin);
      setFound(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to look up that TIN.');
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleInvite() {
    if (!found) return;
    setIsInviting(true);
    setError(null);
    try {
      await firmsApi.inviteClientCompany(firmId, found.id);
      setSuccessMessage(`Invitation sent — ${found.businessName}'s owner must accept before this firm can manage them.`);
      setFound(null);
      setTin('');
      onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to send invitation.');
    } finally {
      setIsInviting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Invite an existing company</h2>
      <p className="mb-4 text-sm text-slate-500">
        Look up a company already registered on PinoyTax AI by its TIN. Its owner must accept before this firm gets
        any access.
      </p>
      <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-4">
        <Field>
          <Label htmlFor="lookupTin">TIN</Label>
          <Input id="lookupTin" required placeholder="123-456-789" value={tin} onChange={(e) => setTin(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" isLoading={isLookingUp}>
          Look up
        </Button>
      </form>

      {found && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="font-medium text-slate-900">{found.businessName}</p>
            {found.firmId ? (
              <p className="text-xs text-red-600">Already managed by another firm.</p>
            ) : (
              <p className="text-xs text-slate-500">Not yet managed by a firm.</p>
            )}
          </div>
          <Button size="sm" onClick={handleInvite} isLoading={isInviting} disabled={!!found.firmId}>
            Send invitation
          </Button>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1">
        <ErrorText>{error}</ErrorText>
        {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
      </div>
    </Card>
  );
}
