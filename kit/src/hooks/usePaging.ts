import { useState } from 'react';
import { DEFAULT_PAGE_SIZE, parsePageSize } from '../components/paging';
import { useStoredState } from './useStoredState';

/**
 * A list's page (0-based) and page size. The size is remembered per viewer under `storageKey`; the page goes back
 * to the first whenever `resetKey` changes (new filters, a new range).
 */
export function usePaging(storageKey: string, resetKey: string) {
  const [pageSize, storePageSize] = useStoredState(storageKey, parsePageSize, () => DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(0);
  const [pageFor, setPageFor] = useState(resetKey);
  if (pageFor !== resetKey) {
    setPageFor(resetKey);
    setPage(0);
  }
  const setPageSize = (size: number) => {
    storePageSize(size);
    setPage(0);
  };
  return { page: pageFor === resetKey ? page : 0, setPage, pageSize, setPageSize };
}
