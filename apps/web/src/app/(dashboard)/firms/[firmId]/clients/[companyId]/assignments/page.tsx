'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Label, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/skeleton';
import { firmsApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import type { FirmCompanyAssignmentEntry, FirmPermissionCatalogEntry, FirmStaffEntry } from '@/lib/types';

export default function FirmClientAssignmentsPage() {
  const { firmId, companyId } = useParams<{ firmId: string; companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <AssignmentsContent firmId={firmId} companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function AssignmentsContent({ firmId, companyId }: { firmId: string; companyId: string }) {
  const [assignments, setAssignments] = useState<FirmCompanyAssignmentEntry[]>([]);
  const [staff, setStaff] = useState<FirmStaffEntry[]>([]);
  const [catalog, setCatalog] = useState<FirmPermissionCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [assignmentsResult, staffResult, catalogResult] = await Promise.all([
        firmsApi.listAssignments(firmId, companyId),
        firmsApi.listStaff(firmId),
        firmsApi.permissionCatalog(),
      ]);
      setAssignments(assignmentsResult);
      setStaff(staffResult.filter((s) => s.status === 'active'));
      setCatalog(catalogResult);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load assignments.');
    } finally {
      setIsLoading(false);
    }
  }, [firmId, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const assignedMembershipIds = new Set(
    assignments.filter((a) => a.status === 'active').map((a) => a.firmMembershipId),
  );
  const unassignedStaff = staff.filter((s) => !assignedMembershipIds.has(s.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/firms/${firmId}/clients`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to clients
        </Link>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-soft">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Client access</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Choose exactly which permissions each firm staff member has on this specific client.
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      {isLoading ? (
        <Card>
          <TableSkeleton columns={3} />
        </Card>
      ) : (
        <>
          {unassignedStaff.length > 0 && (
            <AssignStaffForm
              firmId={firmId}
              companyId={companyId}
              candidates={unassignedStaff}
              catalog={catalog}
              onAssigned={load}
            />
          )}

          <Card>
            <h2 className="mb-4 font-semibold">Current access</h2>
            {assignments.filter((a) => a.status === 'active').length === 0 ? (
              <EmptyState
                title="No one is assigned yet"
                description="Assign a firm staff member above to give them access to this client."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {assignments
                  .filter((a) => a.status === 'active')
                  .map((assignment) => (
                    <AssignmentRow
                      key={assignment.id}
                      assignment={assignment}
                      firmId={firmId}
                      companyId={companyId}
                      catalog={catalog}
                      onChanged={load}
                    />
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function AssignmentRow({
  assignment,
  firmId,
  companyId,
  catalog,
  onChanged,
}: {
  assignment: FirmCompanyAssignmentEntry;
  firmId: string;
  companyId: string;
  catalog: FirmPermissionCatalogEntry[];
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(assignment.permissions.map((p) => p.permission.code)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, firmRole } = assignment.firmMembership;

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await firmsApi.setAssignment(firmId, companyId, assignment.firmMembershipId, Array.from(selected));
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update permissions.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRevoke() {
    if (!confirm(`Remove ${user.firstName} ${user.lastName}'s access to this client?`)) return;
    setIsRevoking(true);
    setError(null);
    try {
      await firmsApi.revokeAssignment(firmId, assignment.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke access.');
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
          <div>
            <p className="text-sm font-medium text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-slate-500">
              {user.email} · <Badge tone="blue">{firmRole.name}</Badge>
            </p>
          </div>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          disabled={isRevoking}
          onClick={handleRevoke}
        >
          Revoke access
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((permission) => (
          <label key={permission.id} className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.has(permission.code)}
              onChange={() => toggle(permission.code)}
            />
            {permission.label}
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={handleSave} isLoading={isSaving} disabled={selected.size === 0}>
          Save permissions
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </li>
  );
}

function AssignStaffForm({
  firmId,
  companyId,
  candidates,
  catalog,
  onAssigned,
}: {
  firmId: string;
  companyId: string;
  candidates: FirmStaffEntry[];
  catalog: FirmPermissionCatalogEntry[];
  onAssigned: () => void;
}) {
  const [membershipId, setMembershipId] = useState(candidates[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleAssign() {
    if (selected.size === 0) {
      setError('Select at least one permission.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await firmsApi.setAssignment(firmId, companyId, membershipId, Array.from(selected));
      setSelected(new Set());
      onAssigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign staff.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Assign a firm staff member</h2>
      <Field>
        <Label htmlFor="membershipId">Staff member</Label>
        <Select id="membershipId" value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.user.firstName} {c.user.lastName} ({c.firmRole.name})
            </option>
          ))}
        </Select>
      </Field>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((permission) => (
          <label key={permission.id} className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.has(permission.code)}
              onChange={() => toggle(permission.code)}
            />
            {permission.label}
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={handleAssign} isLoading={isSubmitting}>
          Grant access
        </Button>
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}
