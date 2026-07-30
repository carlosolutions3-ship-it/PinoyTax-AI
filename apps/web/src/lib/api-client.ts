import type { ApiErrorShape } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

export class ApiError extends Error {
  code: string;
  details?: unknown;
  status: number;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

interface Envelope<T> {
  data: T | null;
  meta: { requestId?: string; timestamp: string };
  errors: ApiErrorShape[];
}

// Access tokens are short-lived (15 min) and kept in memory only -- never in
// localStorage/sessionStorage, to limit XSS exposure. The refresh token is a
// separate httpOnly cookie the browser attaches automatically; it is never
// visible to this JS at all. On a hard page reload, in-memory state is lost
// by design, so AuthProvider calls refresh() once on mount to recover it.
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function rawRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Envelope<{ accessToken: string | null }>;
    const token = body.data?.accessToken ?? null;
    accessToken = token;
    return token;
  } catch {
    return null;
  }
}

/** Deduplicates concurrent refresh calls so a burst of 401s only refreshes once. */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = rawRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  isFormData?: boolean;
  skipAuthRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, isFormData = false, skipAuthRetry = false } = options;

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (!isFormData && body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  // Access token expired mid-session -- refresh once and retry the original
  // request exactly once. skipAuthRetry guards against infinite loops if the
  // refresh endpoint itself somehow 401s.
  if (res.status === 401 && !skipAuthRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  const contentType = res.headers.get('content-type') ?? '';
  const envelope: Envelope<T> = contentType.includes('application/json')
    ? await res.json()
    : { data: null, meta: { timestamp: new Date().toISOString() }, errors: [] };

  if (!res.ok) {
    const err = envelope.errors[0] ?? { code: 'UNKNOWN_ERROR', message: 'Something went wrong.' };
    throw new ApiError(res.status, err);
  }

  return envelope.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData, isFormData: true }),
};

export { refreshAccessToken };
