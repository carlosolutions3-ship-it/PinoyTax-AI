'use client';

import { useCallback, useEffect, useState } from 'react';
import { firmsApi } from '@/lib/endpoints';
import type { MyFirmEntry } from '@/lib/types';
import { ApiError } from '@/lib/api-client';

export function useMyFirms() {
  const [entries, setEntries] = useState<MyFirmEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await firmsApi.listMine();
      setEntries(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load firms.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { entries, isLoading, error, reload };
}
