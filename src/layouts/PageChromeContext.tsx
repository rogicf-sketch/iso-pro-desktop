import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PageChromeState = {
  /** Sobrescreve o titulo da rota (opcional). */
  title?: string;
  /** Ex.: "3.622 materiais · Atualizado agora" */
  meta?: string;
};

type PageChromeContextValue = {
  chrome: PageChromeState;
  setChrome: (next: PageChromeState) => void;
  clearChrome: () => void;
};

const PageChromeContext = createContext<PageChromeContextValue | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChromeState] = useState<PageChromeState>({});

  const setChrome = useCallback((next: PageChromeState) => {
    setChromeState((prev) => {
      const title = next.title?.trim() || undefined;
      const meta = next.meta?.trim() || undefined;
      if (prev.title === title && prev.meta === meta) return prev;
      return { title, meta };
    });
  }, []);

  const clearChrome = useCallback(() => {
    setChromeState({});
  }, []);

  const value = useMemo(
    () => ({ chrome, setChrome, clearChrome }),
    [chrome, setChrome, clearChrome],
  );

  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

export function usePageChromeContext(): PageChromeContextValue {
  const ctx = useContext(PageChromeContext);
  if (!ctx) {
    throw new Error('usePageChromeContext deve ser usado dentro de PageChromeProvider');
  }
  return ctx;
}

/**
 * Publica titulo/meta na topbar enquanto a pagina esta montada.
 * Se `title` for omitido, a topbar usa o titulo da rota.
 */
export function usePageChrome(state: PageChromeState, deps: unknown[] = []): void {
  const { setChrome, clearChrome } = usePageChromeContext();
  const title = state.title;
  const meta = state.meta;

  useEffect(() => {
    setChrome({ title, meta });
    return () => clearChrome();
    // deps explícitas pelo caller (ex.: [total, loading])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setChrome, clearChrome, title, meta, ...deps]);
}
