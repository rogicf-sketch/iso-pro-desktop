import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ModalDiscardConfirm } from './ModalDiscardConfirm';
import { ModalFormGuardContext } from './modalFormGuardContext';

type ProviderProps = {
  children: ReactNode;
  externalDirty?: boolean;
};

export function ModalFormGuardProvider({ children, externalDirty = false }: ProviderProps) {
  const [childDirty, setChildDirty] = useState(false);
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const pendingCloseRef = useRef<(() => void) | null>(null);
  const isDirty = externalDirty || childDirty;

  const registerDirty = useCallback((dirty: boolean) => {
    setChildDirty(dirty);
  }, []);

  const cancelDiscard = useCallback(() => {
    setDiscardPromptOpen(false);
    pendingCloseRef.current = null;
  }, []);

  const confirmDiscard = useCallback(() => {
    const close = pendingCloseRef.current;
    setDiscardPromptOpen(false);
    pendingCloseRef.current = null;
    setChildDirty(false);
    close?.();
  }, []);

  const requestClose = useCallback(
    (close: () => void) => {
      if (!isDirty) {
        close();
        return;
      }
      pendingCloseRef.current = close;
      setDiscardPromptOpen(true);
    },
    [isDirty],
  );

  const api = useMemo(
    () => ({ registerDirty, requestClose, isDirty }),
    [registerDirty, requestClose, isDirty],
  );

  return (
    <>
      <ModalFormGuardContext.Provider value={api}>{children}</ModalFormGuardContext.Provider>
      <ModalDiscardConfirm onCancel={cancelDiscard} onConfirm={confirmDiscard} open={discardPromptOpen} />
    </>
  );
}
