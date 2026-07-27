'use client';

import { useCallback, useEffect, useState } from 'react';
import { companiesApi } from '@/lib/endpoints';
import type { MyCompanyEntry } from '@/lib/types';
import { ApiError } from '@/lib/api-client';

export function useMyCompanies() {
  const [entries, setEntries] = useState<MyCompanyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await companiesApi.listMine();
      setEntries(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load companies.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { entries, isLoading, error, reload };
}
