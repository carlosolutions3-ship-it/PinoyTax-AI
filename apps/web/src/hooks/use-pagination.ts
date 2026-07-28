import { useEffect, useMemo, useState } from 'react';

/** Paginates an already-filtered/sorted array client-side; resets to page 1
 * whenever the item count changes (e.g. a new search/filter was applied). */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, setPage: (p: number) => setPage(Math.min(Math.max(1, p), totalPages)), totalPages, pageItems };
}
