import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconFullscreenEnter, IconFullscreenExit } from './FullscreenIcons';
import { ModalFormGuardProvider, useModalBeforeUnloadGuard, useModalRequestClose } from './modalFormGuard';

export type ModalSize = 'default' | 'wide' | 'fullscreen';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Largura extra (planejamento, RIR, formularios densos). */
  wide?: boolean;
  /** Controla a largura maxima do cartao. `fullscreen` quase encosta na viewport. */
  size?: ModalSize;
  /**
   * Mostra icone de tela inteira no cabecalho (Fullscreen API no cartao do modal),
   * como na pre-visualizacao de etiquetas.
   */
  browserFullscreen?: boolean;
  /** Fecha ao clicar no fundo escurecido. Padrao `false` para nao perder dados de formulario. */
  closeOnBackdropClick?: boolean;
  /** Formulario com alteracoes (quando nao usa `useModalFormDirty` nos filhos). */
  dirty?: boolean;
};

function resolveModalSize(wide: boolean | undefined, size: ModalSize | undefined): ModalSize {
  if (size) return size;
  if (wide) return 'wide';
  return 'default';
}

function modalCardClassName(resolved: ModalSize): string {
  if (resolved === 'fullscreen') return 'modal-card modal-card--fullscreen';
  if (resolved === 'wide') return 'modal-card modal-card--wide';
  return 'modal-card';
}

function ModalChrome({
  title,
  onClose,
  children,
  browserFullscreen,
  closeOnBackdropClick,
  resolved,
  backdropClass,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  browserFullscreen: boolean;
  closeOnBackdropClick: boolean;
  resolved: ModalSize;
  backdropClass: string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [browserFs, setBrowserFs] = useState(false);
  const requestClose = useModalRequestClose(onClose);

  useModalBeforeUnloadGuard(true);

  useEffect(() => {
    function sync() {
      setBrowserFs(document.fullscreenElement === cardRef.current);
    }
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  async function toggleBrowserFullscreen() {
    const el = cardRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* API indisponivel ou recusada */
    }
  }

  function handleBackdropClick() {
    if (closeOnBackdropClick) requestClose();
  }

  return (
    <div className={backdropClass} onClick={handleBackdropClick} role="presentation">
      <div
        ref={cardRef}
        aria-modal="true"
        className={modalCardClassName(resolved)}
        data-modal-fs-host={browserFullscreen ? '1' : undefined}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <div className="modal-header__actions">
            {browserFullscreen ? (
              <button
                aria-label={browserFs ? 'Sair da tela inteira' : 'Tela inteira do formulario'}
                className="icon-button"
                onClick={() => void toggleBrowserFullscreen()}
                title={browserFs ? 'Sair da tela inteira' : 'Tela inteira'}
                type="button"
              >
                <span className="modal-fs-icon">{browserFs ? <IconFullscreenExit /> : <IconFullscreenEnter />}</span>
              </button>
            ) : null}
            <button className="icon-button" onClick={requestClose} type="button">
              Fechar
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Modal({
  title,
  open,
  onClose,
  children,
  wide = false,
  size,
  browserFullscreen = false,
  closeOnBackdropClick = false,
  dirty = false,
}: Props) {
  useLayoutEffect(() => {
    if (open) return;
    const fs = document.fullscreenElement;
    if (fs instanceof HTMLElement && fs.dataset.modalFsHost === '1') {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [open]);

  if (!open) return null;

  const resolved = resolveModalSize(wide, size);
  const backdropClass =
    resolved === 'fullscreen' ? 'modal-backdrop modal-backdrop--fullscreen' : 'modal-backdrop';

  return (
    <ModalFormGuardProvider externalDirty={dirty}>
      <ModalChrome
        backdropClass={backdropClass}
        browserFullscreen={browserFullscreen}
        closeOnBackdropClick={closeOnBackdropClick}
        onClose={onClose}
        resolved={resolved}
        title={title}
      >
        {children}
      </ModalChrome>
    </ModalFormGuardProvider>
  );
}
