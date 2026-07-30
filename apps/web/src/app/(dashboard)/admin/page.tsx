'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Input, Label } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { adminApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { AuditLog, SecurityEvent } from '@/lib/types';

export default function AdminPage() {
  return (
    <RequireAuth>
      <AppShell>
        <AdminContent />
      </AppShell>
    </RequireAuth>
  );
}

function AdminContent() {
  const { user } = useAuth();

  if (!user) return null;

  if (!user.isPlatformAdmin) {
    return (
      <Card className="text-sm text-slate-500">
        This area is restricted to platform administrators.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Admin panel</h1>
      <SecurityEventsSection />
      <AuditLogsSection />
    </div>
  );
}

function SecurityEventsSection() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await adminApi.securityEvents(100);
      setEvents(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load security events.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Platform-wide security events</h2>
      <ErrorText>{error}</ErrorText>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {!isLoading && events.length === 0 ? (
        <p className="text-sm text-slate-500">No security events recorded.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-medium">{e.eventType.replace(/_/g, ' ')}</td>
                  <td className="py-2 pr-4 text-slate-500">{e.userId ?? '—'}</td>
                  <td className="py-2 pr-4 text-slate-500">{formatDateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AuditLogsSection() {
  const [companyId, setCompanyId] = useState('');
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await adminApi.auditLogs(companyId.trim(), 100);
      setLogs(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit logs.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Audit logs by company</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <Field>
          <Label htmlFor="companyId">Company ID</Label>
          <Input
            id="companyId"
            required
            placeholder="00000000-0000-0000-0000-000000000000"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full max-w-96"
          />
        </Field>
        <Button type="submit" isLoading={isLoading}>
          Load audit logs
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>

      {logs && (
        <div className="mt-4 max-h-96 overflow-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500">No audit log entries for this company.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">When</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 font-medium">{log.action}</td>
                    <td className="py-2 pr-4 text-slate-500">
                      {log.entityType ? `${log.entityType}${log.entityId ? ` (${log.entityId.slice(0, 8)}…)` : ''}` : '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {log.actorUserId ? `${log.actorUserId.slice(0, 8)}…` : '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}
