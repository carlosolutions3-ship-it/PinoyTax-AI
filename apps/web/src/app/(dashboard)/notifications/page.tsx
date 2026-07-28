'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, ErrorText, Select } from '@/components/ui';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { usePagination } from '@/hooks/use-pagination';
import { notificationsApi, usersApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { NotificationChannel, NotificationItem, NotificationPreference, NotificationStatus } from '@/lib/types';

const STATUS_TONE: Record<NotificationStatus, 'slate' | 'green' | 'amber' | 'red' | 'blue'> = {
  queued: 'slate',
  sent: 'blue',
  failed: 'red',
  read: 'green',
};

const CHANNELS: NotificationChannel[] = ['email', 'sms', 'push', 'in_app'];
const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
  in_app: 'In-app',
};

// filing_deadline is the only category the backend actually sends today
// (DeadlineReminderJob) — see notifications.service.ts's getPreferences.
const KNOWN_CATEGORIES = ['filing_deadline'];
const CATEGORY_LABELS: Record<string, string> = { filing_deadline: 'Filing deadline reminders' };

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <NotificationsContent />
      </AppShell>
    </RequireAuth>
  );
}

function NotificationsContent() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | ''>('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [notificationsRes, preferencesRes] = await Promise.all([
        usersApi.myNotifications(),
        notificationsApi.getPreferences(),
      ]);
      setNotifications(
        notificationsRes.sort(
          (a, b) => new Date(b.scheduledFor ?? b.sentAt ?? 0).getTime() - new Date(a.scheduledFor ?? a.sentAt ?? 0).getTime(),
        ),
      );
      setPreferences(preferencesRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load notifications.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredNotifications = notifications.filter((n) => !statusFilter || n.status === statusFilter);
  const { page, setPage, totalPages, pageItems } = usePagination(filteredNotifications, 10);

  function preferenceFor(channel: NotificationChannel, category: string): boolean {
    const match = preferences.find((p) => p.channel === channel && p.category === category);
    // Defaults to enabled when no explicit preference row exists yet, matching
    // NotificationsService.isChannelEnabled's default-on behavior server-side.
    return match ? match.isEnabled : true;
  }

  async function togglePreference(channel: NotificationChannel, category: string) {
    const key = `${channel}:${category}`;
    const nextValue = !preferenceFor(channel, category);
    setSavingKey(key);
    try {
      const updated = await notificationsApi.setPreference({ channel, category, isEnabled: nextValue });
      setPreferences((prev) => {
        const idx = prev.findIndex((p) => p.channel === channel && p.category === category);
        if (idx === -1) return [...prev, updated];
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update preference.');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <ErrorText>{error}</ErrorText>

      <Card>
        <h2 className="mb-4 font-semibold">Preferences</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Category</th>
                {CHANNELS.map((c) => (
                  <th key={c} className="py-2 pr-4">
                    {CHANNEL_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KNOWN_CATEGORIES.map((category) => (
                <tr key={category} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-medium">{CATEGORY_LABELS[category] ?? category}</td>
                  {CHANNELS.map((channel) => {
                    const key = `${channel}:${category}`;
                    const enabled = preferenceFor(channel, category);
                    return (
                      <td key={channel} className="py-2 pr-4">
                        <button
                          type="button"
                          onClick={() => togglePreference(channel, category)}
                          disabled={savingKey === key}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          } disabled:opacity-50`}
                        >
                          {savingKey === key ? '…' : enabled ? 'On' : 'Off'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Recent notifications</h2>
          {notifications.length > 0 && (
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as NotificationStatus | '')}
              className="w-36"
            >
              <option value="">All statuses</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="read">Read</option>
            </Select>
          )}
        </div>
        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {!isLoading && notifications.length === 0 ? (
          <EmptyState title="No notifications yet" description="Filing reminders and alerts will appear here." />
        ) : !isLoading && filteredNotifications.length === 0 ? (
          <EmptyState title="No matching notifications" description="Try a different status filter." />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {pageItems.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-slate-600">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {CHANNEL_LABELS[n.channel]} · {formatDateTime(n.sentAt ?? n.scheduledFor)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[n.status]}>{n.status}</Badge>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={setPage}
                totalItems={filteredNotifications.length}
                pageSize={10}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
