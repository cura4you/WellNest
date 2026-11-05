import { useCallback, useEffect, useRef, useState } from 'react';

export function useDashboardData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const requestId = useRef(0);
  const refreshData = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const result = await load();
      if (id === requestId.current) setData(result);
    } catch (failure: unknown) {
      if (id === requestId.current) {
        const cause = (failure && typeof failure === 'object' ? failure : {}) as { name?: string; message?: string; status?: number };
        setError({ message: cause.name === 'TypeError' ? 'Please check your connection and try again.' : cause.message || 'Please check your connection and try again.', status: cause.status });
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [load]);
  useEffect(() => { void refreshData(); return () => { requestId.current++; }; }, [refreshData]);
  return { data, loading, error, refreshData };
}
