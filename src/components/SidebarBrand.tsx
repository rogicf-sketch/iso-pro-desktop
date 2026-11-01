import type { SidebarMarcaId } from '../lib/sidebarMarca';

type Props = {
  marca: SidebarMarcaId;
};

/** Marca da barra lateral — clássica (placa) ou ícone de barras. */
export function SidebarBrand({ marca }: Props) {
  if (marca === 'icone') {
    return (
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark" aria-label="I.S.O PRO — Gestão de Materiais">
          <span className="sidebar-brand-mark-icon" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <div className="sidebar-brand-mark-text">
            <div className="sidebar-brand-mark-row">
              <span className="sidebar-brand-iso">I.S.O</span>
              <span className="sidebar-brand-plate-divider" aria-hidden />
              <span className="sidebar-brand-pro">PRO</span>
            </div>
            <p className="sidebar-brand-product">Gestão de Materiais</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar-brand">
      <div className="sidebar-brand-plate" aria-label="I.S.O PRO — Gestão de Materiais">
        <div className="sidebar-brand-plate-shine" aria-hidden />
        <div className="sidebar-brand-plate-inner">
          <div className="sidebar-brand-plate-row">
            <span className="sidebar-brand-iso">I.S.O</span>
            <span className="sidebar-brand-plate-divider" aria-hidden />
            <span className="sidebar-brand-pro">PRO</span>
          </div>
          <p className="sidebar-brand-product">Gestão de Materiais</p>
        </div>
      </div>
    </div>
  );
}
