import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface Resource<T> {
  data?: T;
  error?: string;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetches `path` (re-fetching when it changes or on `reload`); `null` skips the request.
 * Previous data stays visible while a refresh is in flight to avoid layout flicker.
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [nonce, setNonce] = useState(0);
  const key = path === null ? null : `${path}#${nonce}`;
  const [state, setState] = useState<{ key?: string; data?: T; error?: string }>({});

  useEffect(() => {
    if (path === null || key === null) return;
    let cancelled = false;
    api<T>(path)
      .then((data) => !cancelled && setState({ key, data }))
      .catch((e: Error) => !cancelled && setState((s) => ({ key, data: s.data, error: e.message })));
    return () => {
      cancelled = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = key !== null && state.key !== key;
  return { data: state.data, error: loading ? undefined : state.error, loading: loading && state.data === undefined, reload };
}

/** Value that only updates after `ms` without changes — avoids a request per keystroke. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
