import { Outlet } from 'react-router-dom';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '@/lib/logoInstitucional.constants';
import { normalizarUrlAssetPublicParaAmbiente } from '@/lib/logoInstitucional';

export function AuthLayout() {
  // Login: sempre o logo do sistema (fábrica). O logo da obra/cliente fica para
  // recibos, RIR e restantes impressões — não na porta de entrada.
  const logoUrl = normalizarUrlAssetPublicParaAmbiente(LOGO_INSTITUCIONAL_PADRAO_FABRICA);

  return (
    <div className="auth-page">
      <div className="auth-page__ambient" aria-hidden />
      <div className="auth-page__shell">
        <aside className="auth-hero">
          <div className="auth-hero__logo-wrap">
            <img className="auth-hero__logo" src={logoUrl} alt="I.S.O PRO — Gestão de materiais" />
          </div>
          <div className="auth-brand">
            <p className="auth-kicker">I.S.O PRO</p>
            <h1>Gestão de materiais</h1>
            <p className="auth-hero__lead">
              Desktop para rastreio, recebimentos, inventário e qualidade — preparado para obra e almoxarifado.
            </p>
          </div>
          <ul className="auth-hero__bullets">
            <li>
              <span className="auth-hero__dot" aria-hidden />
              Conformidade e rasto de auditoria
            </li>
            <li>
              <span className="auth-hero__dot" aria-hidden />
              Recebimentos, documentos e relatórios integrados
            </li>
            <li>
              <span className="auth-hero__dot" aria-hidden />
              Operação offline com sincronização na cloud, quando configurada
            </li>
          </ul>
        </aside>

        <main className="auth-card auth-panel">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
