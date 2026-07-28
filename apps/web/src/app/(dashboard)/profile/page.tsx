'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format';
import type { SessionInfo } from '@/lib/types';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <AppShell>
        <ProfileContent />
      </AppShell>
    </RequireAuth>
  );
}

function ProfileContent() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await authApi.listSessions();
      setSessions(result.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load sessions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function handleSendReset() {
    if (!user) return;
    setIsSendingReset(true);
    setError(null);
    try {
      await authApi.forgotPassword(user.email);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  }

  async function handleRevoke(sessionId: string) {
    setRevokingId(sessionId);
    try {
      await authApi.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke session.');
    } finally {
      setRevokingId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <ErrorText>{error}</ErrorText>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-sm text-slate-500">{user.email}</p>
            {user.phoneNumber && <p className="text-sm text-slate-500">{user.phoneNumber}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={user.isEmailVerified ? 'green' : 'amber'}>
              {user.isEmailVerified ? 'Email verified' : 'Email not verified'}
            </Badge>
            {user.isPlatformAdmin && <Badge tone="blue">Platform admin</Badge>}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Member since {formatDate(user.createdAt)}</p>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={handleSendReset} isLoading={isSendingReset}>
            Send password reset email
          </Button>
          {resetSent && (
            <p className="mt-2 text-sm text-emerald-600">
              If an account exists for {user.email}, a reset link has been sent.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Active sessions</h2>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {!isLoading && sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No active sessions.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                <div>
                  <p className="text-sm font-medium">{s.deviceName ?? 'Unknown device'}</p>
                  <p className="text-xs text-slate-500">
                    {s.ipAddress ?? 'Unknown IP'} · Last active {formatDateTime(s.lastActiveAt)}
                    {s.isRememberMe ? ' · Remembered' : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => handleRevoke(s.id)}
                  isLoading={revokingId === s.id}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
