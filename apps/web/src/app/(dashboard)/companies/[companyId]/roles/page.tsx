'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { companiesApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { StaffEntry, StaffRoleStatus } from '@/lib/types';

const STATUS_TONE: Record<StaffRoleStatus, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  pending: 'amber',
  active: 'green',
  revoked: 'slate',
};

const ROLE_LABELS: Record<string, string> = {
  business_owner: 'Business owner',
  accountant: 'Accountant',
  bookkeeper: 'Bookkeeper',
  firm_admin: 'Firm admin',
  administrator: 'Administrator',
};

export default function RolesPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <RolesContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function RolesContent({ companyId }: { companyId: string }) {
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await companiesApi.listStaff(companyId);
      setStaff(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load staff.');
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(userCompanyRoleId: string) {
    setRevokingId(userCompanyRoleId);
    try {
      const updated = await companiesApi.revokeStaff(companyId, userCompanyRoleId);
      setStaff((prev) => prev.map((s) => (s.id === userCompanyRoleId ? updated : s)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke access.');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
      <ErrorText>{error}</ErrorText>

      <InviteStaffForm companyId={companyId} onInvited={load} />

      <Card>
        <h2 className="mb-4 font-semibold">Staff on this company</h2>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {!isLoading && staff.length === 0 ? (
          <p className="text-sm text-slate-500">No staff attached yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Invited</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {s.user.firstName} {s.user.lastName}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{s.user.email}</td>
                    <td className="py-2 pr-4">{ROLE_LABELS[s.role.code] ?? s.role.name}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{formatDate(s.invitedAt)}</td>
                    <td className="py-2 pr-4">
                      {s.status !== 'revoked' && s.role.code !== 'business_owner' && (
                        <Button variant="ghost" onClick={() => handleRevoke(s.id)} isLoading={revokingId === s.id}>
                          Revoke
                        </Button>
                      )}
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

function InviteStaffForm({ companyId, onInvited }: { companyId: string; onInvited: () => void }) {
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
      onInvited();
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
          <Input id="inviteEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
