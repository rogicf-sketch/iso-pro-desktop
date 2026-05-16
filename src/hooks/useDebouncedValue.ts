import { useEffect, useState } from 'react';

/** Valor que so actualiza apos `delayMs` sem alteracoes em `value` (ex.: campo Buscar em listagens). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
