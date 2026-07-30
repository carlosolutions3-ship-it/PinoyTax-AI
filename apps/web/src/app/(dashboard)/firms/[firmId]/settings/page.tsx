'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { FirmNav } from '@/components/firm-nav';
import { Button } from '@/components/button';
import { Card, ErrorText, Field, Input, Label } from '@/components/ui';
import { CardSkeleton } from '@/components/skeleton';
import { firmsApi, UpdateFirmInput } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import type { Firm } from '@/lib/types';

const FIRM_TYPE_LABELS: Record<string, string> = {
  accounting_firm: 'Accounting firm',
  bookkeeping_firm: 'Bookkeeping firm',
  tax_consultancy: 'Tax consultancy',
};

export default function FirmSettingsPage() {
  const { firmId } = useParams<{ firmId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <FirmNav firmId={firmId} />
        <FirmSettingsContent firmId={firmId} />
      </AppShell>
    </RequireAuth>
  );
}

function FirmSettingsContent({ firmId }: { firmId: string }) {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [form, setForm] = useState<UpdateFirmInput>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await firmsApi.getOne(firmId);
      setFirm(result);
      setForm({ firmName: result.firmName, contactEmail: result.contactEmail, contactNumber: result.contactNumber ?? '' });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load firm settings.');
    } finally {
      setIsLoading(false);
    }
  }, [firmId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);
    try {
      const updated = await firmsApi.update(firmId, form);
      setFirm(updated);
      setSuccessMessage('Firm profile updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update firm profile.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Firm settings</h1>
        <p className="text-sm text-slate-500">Edit your firm&apos;s profile details.</p>
      </div>

      {isLoading ? (
        <CardSkeleton count={1} />
      ) : (
        <Card>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field>
              <Label htmlFor="firmName">Firm name</Label>
              <Input
                id="firmName"
                required
                value={form.firmName ?? ''}
                onChange={(e) => setForm({ ...form, firmName: e.target.value })}
              />
            </Field>
            <Field>
              <Label>Firm type</Label>
              <p className="py-2 text-sm text-slate-600">{firm ? FIRM_TYPE_LABELS[firm.firmType] ?? firm.firmType : '—'}</p>
            </Field>
            <Field>
              <Label htmlFor="contactEmail">Contact email</Label>
              <Input
                id="contactEmail"
                type="email"
                required
                value={form.contactEmail ?? ''}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              />
            </Field>
            <Field>
              <Label htmlFor="contactNumber">Contact number</Label>
              <Input
                id="contactNumber"
                value={form.contactNumber ?? ''}
                onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <ErrorText>{error}</ErrorText>
              {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={isSaving}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
