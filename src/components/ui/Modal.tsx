import type { ReactNode } from 'react';

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Modal largo (formularios RIR completos). */
  wide?: boolean;
};

export function Modal({ title, open, onClose, children, wide = false }: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-modal="true"
        className={wide ? 'modal-card modal-card--wide' : 'modal-card'}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} type="button">
            Fechar
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
