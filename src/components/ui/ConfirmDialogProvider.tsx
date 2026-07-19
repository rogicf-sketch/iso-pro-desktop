import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { OperationalNotice } from './OperationalNotice';

export type AppConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'neutral' | 'warning' | 'critical';
  /** Destaque visual no botao de confirmacao (exclusao, revogacao). */
  danger?: boolean;
};

type ConfirmState = Required<Pick<AppConfirmOptions, 'message'>> &
  Omit<AppConfirmOptions, 'message'> & { open: true };

const ConfirmDialogContext = createContext<((options: AppConfirmOptions | string) => Promise<boolean>) | null>(
  null,
);

function normalizeOptions(options: AppConfirmOptions | string): ConfirmState {
  const base = typeof options === 'string' ? { message: options } : options;
  return {
    open: true,
    title: base.title ?? 'Confirmar',
    message: base.message,
    confirmLabel: base.confirmLabel ?? 'Continuar',
    cancelLabel: base.cancelLabel ?? 'Cancelar',
    tone: base.tone ?? 'warning',
    danger: base.danger ?? false,
  };
}

function AppConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  return createPortal(
    <div className="modal-backdrop modal-backdrop--confirm" onClick={onCancel} role="presentation">
      <div
        aria-labelledby="app-confirm-title"
        aria-modal="true"
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <div className="modal-header">
          <h2 id="app-confirm-title">{state.title}</h2>
          <div className="modal-header__actions">
            <button className="icon-button" onClick={onCancel} type="button">
              Fechar
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="editor-block stack-grid">
            <OperationalNotice tone={state.tone}>
              <p className="panel-copy" style={{ margin: 0, whiteSpace: 'pre-line' }}>
                {state.message}
              </p>
            </OperationalNotice>
            <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Button onClick={onCancel} type="button" variant="ghost">
                {state.cancelLabel}
              </Button>
              <Button onClick={onConfirm} type="button" variant={state.danger ? 'danger' : 'primary'}>
                {state.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: AppConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState(normalizeOptions(options));
    });
  }, []);

  const finish = useCallback((value: boolean) => {
    setState(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  }, []);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {state ? (
        <AppConfirmDialog state={state} onCancel={() => finish(false)} onConfirm={() => finish(true)} />
      ) : null}
    </ConfirmDialogContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook acompanha o provider; sem impacto no fast refresh em producao
export function useConfirmDialog() {
  const confirm = useContext(ConfirmDialogContext);
  if (!confirm) {
    throw new Error('useConfirmDialog deve ser usado dentro de ConfirmDialogProvider.');
  }
  return { confirm };
}
