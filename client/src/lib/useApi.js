import { useEffect, useState, useCallback } from 'react';

// Minimal data hook for the local JSON API. Returns { data, error, loading,
// reload }. The backend is the unchanged Express /api/* layer.
export function useApi(url, { skip = false } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !skip });

  const reload = useCallback(async () => {
    if (!url) return;
    setState(s => ({ ...s, loading: true }));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, [url]);

  useEffect(() => {
    if (skip) return;
    reload();
  }, [reload, skip]);

  return { ...state, reload };
}
