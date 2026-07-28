'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, ErrorText, Field, Label, Select } from '@/components/ui';
import { Button } from '@/components/button';
import { formsApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import type { Agency, FormTemplate } from '@/lib/types';

const AGENCY_LABELS: Record<Agency, string> = {
  bir: 'BIR',
  sss: 'SSS',
  philhealth: 'PhilHealth',
  pagibig: 'Pag-IBIG',
  lgu: 'LGU',
};

export default function FormsLibraryPage() {
  return (
    <RequireAuth>
      <AppShell>
        <FormsLibraryContent />
      </AppShell>
    </RequireAuth>
  );
}

function FormsLibraryContent() {
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null);

  const load = useCallback(async (agency?: string) => {
    setIsLoading(true);
    try {
      const result = await formsApi.list(agency || undefined);
      setForms(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load forms.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(agencyFilter);
  }, [agencyFilter, load]);

  async function handleDownload(formCode: string) {
    setDownloadingCode(formCode);
    try {
      const { url } = await formsApi.getDownloadUrl(formCode);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate download link.');
    } finally {
      setDownloadingCode(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Government forms library</h1>
      <ErrorText>{error}</ErrorText>

      <Card>
        <Field>
          <Label htmlFor="agencyFilter">Agency</Label>
          <Select id="agencyFilter" value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}>
            <option value="">All agencies</option>
            {Object.entries(AGENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {!isLoading && forms.length === 0 && (
        <Card className="text-sm text-slate-500">No forms found for this filter.</Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {forms.map((form) => (
          <Card key={form.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">
                  {form.formCode} — {form.title}
                </p>
                <Badge tone="blue">{AGENCY_LABELS[form.agency]}</Badge>
              </div>
            </div>
            {form.description && <p className="mt-2 text-sm text-slate-600">{form.description}</p>}
            {form.purpose && <p className="mt-1 text-xs text-slate-500">Purpose: {form.purpose}</p>}
            {form.filingFrequency && (
              <p className="mt-1 text-xs text-slate-500">Filing frequency: {form.filingFrequency}</p>
            )}
            {form.requiredAttachments.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Required attachments: {form.requiredAttachments.join(', ')}
              </p>
            )}
            {form.fileUrl && (
              <div className="mt-3">
                <Button
                  variant="secondary"
                  onClick={() => handleDownload(form.formCode)}
                  isLoading={downloadingCode === form.formCode}
                >
                  Download
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
