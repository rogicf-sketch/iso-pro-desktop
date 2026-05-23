import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { MODAL_DISCARD_CONFIRM_MESSAGE } from './modalFormGuard.constants';
import { ModalFormGuardContext } from './modalFormGuardContext';

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
