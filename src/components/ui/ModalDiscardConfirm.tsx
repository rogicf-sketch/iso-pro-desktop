import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { MODAL_DISCARD_CONFIRM_MESSAGE, MODAL_DISCARD_CONFIRM_TITLE } from './modalFormGuard.constants';
import { OperationalNotice } from './OperationalNotice';

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ModalDiscardConfirm({ open, onCancel, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop modal-backdrop--confirm" onClick={onCancel} role="presentation">
      <div
        aria-labelledby="modal-discard-title"
        aria-modal="true"
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <div className="modal-header">
          <h2 id="modal-discard-title">{MODAL_DISCARD_CONFIRM_TITLE}</h2>
          <div className="modal-header__actions">
            <button className="icon-button" onClick={onCancel} type="button">
              Fechar
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="editor-block stack-grid">
            <OperationalNotice tone="warning">{MODAL_DISCARD_CONFIRM_MESSAGE}</OperationalNotice>
            <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Button onClick={onCancel} type="button">
                Continuar editando
              </Button>
              <Button onClick={onConfirm} type="button" variant="ghost">
                Fechar sem salvar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
