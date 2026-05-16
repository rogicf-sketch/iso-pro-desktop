import { Outlet } from 'react-router-dom';
import { normalizarUrlAssetPublicParaAmbiente, resolverUrlLogoInstitucional } from '@/lib/logoInstitucional';

export function AuthLayout() {
  const logoUrl = normalizarUrlAssetPublicParaAmbiente(resolverUrlLogoInstitucional());

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
