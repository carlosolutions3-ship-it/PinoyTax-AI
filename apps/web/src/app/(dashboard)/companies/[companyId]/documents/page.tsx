'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/require-auth';
import { AppShell } from '@/components/app-shell';
import { CompanyNav } from '@/components/company-nav';
import { Button } from '@/components/button';
import { Badge, Card, ErrorText, Field, Input, Label, Select } from '@/components/ui';
import { documentsApi } from '@/lib/endpoints';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { DocumentCategory, DocumentVersion, Folder, VaultDocument } from '@/lib/types';

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  bir_form: 'BIR form',
  permit: 'Permit',
  receipt: 'Receipt',
  payment_confirmation: 'Payment confirmation',
  other: 'Other',
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function formatBytes(value: string | null): string {
  if (!value) return '—';
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { companyId } = useParams<{ companyId: string }>();

  return (
    <RequireAuth>
      <AppShell>
        <CompanyNav companyId={companyId} />
        <DocumentsContent companyId={companyId} />
      </AppShell>
    </RequireAuth>
  );
}

function DocumentsContent({ companyId }: { companyId: string }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [folderFilter, setFolderFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [foldersRes, documentsRes] = await Promise.all([
        documentsApi.listFolders(companyId),
        documentsApi.list(companyId),
      ]);
      setFolders(foldersRes);
      setDocuments(documentsRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load documents.');
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDownload(documentId: string) {
    try {
      const { url } = await documentsApi.getDownloadUrl(companyId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate download link.');
    }
  }

  const visibleDocuments = documents.filter(
    (d) => (!folderFilter || d.folderId === folderFilter) && (!categoryFilter || d.category === categoryFilter),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Document vault</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowNewFolder((v) => !v)}>
            {showNewFolder ? 'Cancel' : 'New folder'}
          </Button>
          <Button onClick={() => setShowUpload((v) => !v)}>{showUpload ? 'Cancel' : 'Upload document'}</Button>
        </div>
      </div>

      <ErrorText>{error}</ErrorText>

      {showNewFolder && (
        <NewFolderForm
          companyId={companyId}
          folders={folders}
          onCreated={() => {
            setShowNewFolder(false);
            load();
          }}
        />
      )}

      {showUpload && (
        <UploadForm
          companyId={companyId}
          folders={folders}
          onUploaded={() => {
            setShowUpload(false);
            load();
          }}
        />
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <Field>
            <Label htmlFor="folderFilter">Folder</Label>
            <Select id="folderFilter" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label htmlFor="categoryFilter">Category</Label>
            <Select id="categoryFilter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {!isLoading && visibleDocuments.length === 0 ? (
          <p className="text-sm text-slate-500">No documents match these filters.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleDocuments.map((doc) => (
              <DocumentRow key={doc.id} companyId={companyId} doc={doc} onDownload={() => handleDownload(doc.id)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DocumentRow({
  companyId,
  doc,
  onDownload,
}: {
  companyId: string;
  doc: VaultDocument;
  onDownload: () => void;
}) {
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [isUploadingVersion, setIsUploadingVersion] = useState(false);

  async function toggleVersions() {
    if (!showVersions) {
      setIsLoadingVersions(true);
      try {
        const result = await documentsApi.listVersions(companyId, doc.id);
        setVersions(result);
      } catch (err) {
        setVersionError(err instanceof ApiError ? err.message : 'Failed to load versions.');
      } finally {
        setIsLoadingVersions(false);
      }
    }
    setShowVersions((v) => !v);
  }

  async function handleUploadVersion() {
    if (!versionFile) return;
    setVersionError(null);
    setIsUploadingVersion(true);
    try {
      await documentsApi.uploadVersion(companyId, doc.id, versionFile);
      const result = await documentsApi.listVersions(companyId, doc.id);
      setVersions(result);
      setVersionFile(null);
    } catch (err) {
      setVersionError(err instanceof ApiError ? err.message : 'Failed to upload new version.');
    } finally {
      setIsUploadingVersion(false);
    }
  }

  return (
    <li className="rounded-md border border-slate-200 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">{doc.fileName}</p>
          <p className="text-xs text-slate-500">
            {formatBytes(doc.sizeBytes)} · Uploaded {formatDate(doc.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone="blue">{CATEGORY_LABELS[doc.category]}</Badge>
          <Button variant="ghost" onClick={toggleVersions}>
            Versions
          </Button>
          <Button variant="secondary" onClick={onDownload}>
            Download
          </Button>
        </div>
      </div>

      {showVersions && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <ErrorText>{versionError}</ErrorText>
          {isLoadingVersions ? (
            <p className="text-xs text-slate-500">Loading versions…</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs text-slate-600">
              {versions.map((v) => (
                <li key={v.id}>
                  Version {v.versionNumber} — uploaded {formatDate(v.createdAt)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input
              type="file"
              onChange={(e: ChangeEvent<HTMLInputElement>) => setVersionFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <Button
              variant="ghost"
              onClick={handleUploadVersion}
              isLoading={isUploadingVersion}
              disabled={!versionFile}
            >
              Upload new version
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function NewFolderForm({
  companyId,
  folders,
  onCreated,
}: {
  companyId: string;
  folders: Folder[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [parentFolderId, setParentFolderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await documentsApi.createFolder(companyId, { name, parentFolderId: parentFolderId || undefined });
      setName('');
      setParentFolderId('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create folder.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <Field>
          <Label htmlFor="folderName">Folder name</Label>
          <Input id="folderName" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <Label htmlFor="parentFolder">Parent folder (optional)</Label>
          <Select id="parentFolder" value={parentFolderId} onChange={(e) => setParentFolderId(e.target.value)}>
            <option value="">None (top level)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" isLoading={isSubmitting}>
          Create folder
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

function UploadForm({
  companyId,
  folders,
  onUploaded,
}: {
  companyId: string;
  folders: Folder[];
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [folderId, setFolderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File exceeds the 25 MB upload limit.');
      return;
    }
    setIsSubmitting(true);
    try {
      await documentsApi.upload(companyId, file, { category, folderId: folderId || undefined });
      setFile(null);
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to upload document.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
        <Field>
          <Label htmlFor="file">File (max 25 MB)</Label>
          <input
            id="file"
            type="file"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field>
          <Label htmlFor="category">Category</Label>
          <Select id="category" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="uploadFolder">Folder (optional)</Label>
          <Select id="uploadFolder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">None (top level)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-3">
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="sm:col-span-3">
          <Button type="submit" isLoading={isSubmitting}>
            Upload
          </Button>
        </div>
      </form>
    </Card>
  );
}
