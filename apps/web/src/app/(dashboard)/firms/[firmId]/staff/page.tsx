'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { FirmNav } from '@/components/firm-nav';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/skeleton';
import { firmsApi, AssignableFirmRoleCode } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { FirmStaffEntry, FirmMembershipStatus } from '@/lib/types';

const FIRM_ROLE_LABELS: Record<string, string> = {
  firm_owner: 'Firm owner',
  firm_admin: 'Firm admin',
  firm_accountant: 'Accountant',
  firm_bookkeeper: 'Bookkeeper',
  firm_auditor: 'Auditor',
};

const STATUS_TONE: Record<FirmMembershipStatus, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  pending: 'amber',
  active: 'green',
  revoked: 'slate',
};

export default function FirmStaffPage() {
  const { firmId } = useParams<{ firmId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <FirmNav firmId={firmId} />
        <FirmStaffContent firmId={firmId} />
      </AppShell>
    </RequireAuth>
  );
}

function FirmStaffContent({ firmId }: { firmId: string }) {
  const [staff, setStaff] = useState<FirmStaffEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await firmsApi.listStaff(firmId);
      setStaff(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load firm staff.');
    } finally {
      setIsLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(membershipId: string) {
    setBusyId(membershipId);
    try {
      const updated = await firmsApi.revokeStaff(firmId, membershipId);
      setStaff((prev) => prev.map((s) => (s.id === membershipId ? updated : s)));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke access.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRoleChange(membershipId: string, firmRoleCode: AssignableFirmRoleCode) {
    setBusyId(membershipId);
    try {
      const updated = await firmsApi.updateStaffRole(firmId, membershipId, firmRoleCode);
      setStaff((prev) => prev.map((s) => (s.id === membershipId ? updated : s)));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change role.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Firm staff</h1>
        <p className="text-sm text-slate-500">
          Staff invited here get access to this firm — assign them to specific clients from the Clients tab.
        </p>
      </div>

      <InviteFirmStaffForm firmId={firmId} onInvited={load} />

      <ErrorText>{error}</ErrorText>

      <Card>
        <h2 className="mb-4 font-semibold">Staff on this firm</h2>
        {isLoading ? (
          <TableSkeleton columns={5} />
        ) : staff.length === 0 ? (
          <EmptyState title="No staff invited yet" description="Invite your first firm staff member above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Firm role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Invited</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${s.user.firstName} ${s.user.lastName}`} size="sm" />
                        {s.user.firstName} {s.user.lastName}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{s.user.email}</td>
                    <td className="py-2 pr-4">
                      {s.firmRole.code === 'firm_owner' || s.status === 'revoked' ? (
                        FIRM_ROLE_LABELS[s.firmRole.code] ?? s.firmRole.name
                      ) : (
                        <Select
                          className="py-1"
                          value={s.firmRole.code}
                          disabled={busyId === s.id}
                          onChange={(e) => handleRoleChange(s.id, e.target.value as AssignableFirmRoleCode)}
                        >
                          <option value="firm_admin">Firm admin</option>
                          <option value="firm_accountant">Accountant</option>
                          <option value="firm_bookkeeper">Bookkeeper</option>
                          <option value="firm_auditor">Auditor</option>
                        </Select>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{formatDate(s.invitedAt)}</td>
                    <td className="py-2 pr-4">
                      {s.status !== 'revoked' && s.firmRole.code !== 'firm_owner' && (
                        <Button variant="ghost" onClick={() => handleRevoke(s.id)} isLoading={busyId === s.id}>
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

function InviteFirmStaffForm({ firmId, onInvited }: { firmId: string; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [firmRoleCode, setFirmRoleCode] = useState<AssignableFirmRoleCode>('firm_accountant');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      await firmsApi.inviteStaff(firmId, { email, firmRoleCode });
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
      <h2 className="mb-1 font-semibold">Invite firm staff</h2>
      <p className="mb-4 text-sm text-slate-500">
        Invited once to the firm, not to each client separately. They must already have a PinoyTax AI account — ask
        them to register first if they don&apos;t.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <Field>
          <Label htmlFor="inviteEmail">Email</Label>
          <Input id="inviteEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="firmRoleCode">Firm role</Label>
          <Select
            id="firmRoleCode"
            value={firmRoleCode}
            onChange={(e) => setFirmRoleCode(e.target.value as AssignableFirmRoleCode)}
          >
            <option value="firm_admin">Firm admin</option>
            <option value="firm_accountant">Accountant</option>
            <option value="firm_bookkeeper">Bookkeeper</option>
            <option value="firm_auditor">Auditor</option>
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
