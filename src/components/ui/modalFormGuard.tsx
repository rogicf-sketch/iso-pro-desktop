import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export const MODAL_DISCARD_CONFIRM_MESSAGE =
  'Ha alteracoes nao salvas. Fechar mesmo assim? O que foi preenchido sera perdido.';

type ModalFormGuardApi = {
  registerDirty: (dirty: boolean) => void;
  requestClose: (close: () => void) => void;
  isDirty: boolean;
};

const ModalFormGuardContext = createContext<ModalFormGuardApi | null>(null);

type ProviderProps = {
  children: ReactNode;
  externalDirty?: boolean;
};

export function ModalFormGuardProvider({ children, externalDirty = false }: ProviderProps) {
  const [childDirty, setChildDirty] = useState(false);
  const isDirty = externalDirty || childDirty;

  const registerDirty = useCallback((dirty: boolean) => {
    setChildDirty(dirty);
  }, []);

  const requestClose = useCallback(
    (close: () => void) => {
      if (isDirty && !window.confirm(MODAL_DISCARD_CONFIRM_MESSAGE)) return;
      close();
    },
    [isDirty],
  );

  const api = useMemo(
    () => ({ registerDirty, requestClose, isDirty }),
    [registerDirty, requestClose, isDirty],
  );

  return <ModalFormGuardContext.Provider value={api}>{children}</ModalFormGuardContext.Provider>;
}

function useModalFormGuard() {
  return useContext(ModalFormGuardContext);
}

export function useModalFormDirty(isDirty: boolean) {
  const ctx = useModalFormGuard();
  const registerDirty = ctx?.registerDirty;

  useEffect(() => {
    registerDirty?.(isDirty);
    return () => registerDirty?.(false);
  }, [isDirty, registerDirty]);
}

export function useModalGuardedClose(onClose: () => void) {
  const ctx = useModalFormGuard();
  return useCallback(() => {
    if (ctx) {
      ctx.requestClose(onClose);
      return;
    }
    onClose();
  }, [ctx, onClose]);
}

export function useModalRequestClose(onClose: () => void) {
  const ctx = useModalFormGuard();
  return useCallback(() => {
    if (ctx) {
      ctx.requestClose(onClose);
      return;
    }
    onClose();
  }, [ctx, onClose]);
}

export function useModalIsDirty(): boolean {
  return useModalFormGuard()?.isDirty ?? false;
}

export function useModalBeforeUnloadGuard(open: boolean) {
  const isDirty = useModalIsDirty();
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!open) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [open]);
}
