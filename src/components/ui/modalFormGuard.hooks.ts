import { useCallback, useContext, useEffect, useRef } from 'react';
import { ModalFormGuardContext } from './modalFormGuardContext';

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

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

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
