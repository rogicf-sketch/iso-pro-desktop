import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LocalStorageCorruptoBanner } from '@/components/LocalStorageCorruptoBanner';
import { GlobalConsultaRapida } from '@/components/GlobalConsultaRapida';
import { AtendimentoOperacaoGuardProvider } from '../modules/atendimento/context/AtendimentoOperacaoGuard';
import { useAtendimentoOperacaoGuard } from '../modules/atendimento/context/atendimentoOperacaoGuard.hooks';
import { getTitularSistemaLinhaResumo } from '../lib/titularSistemaCodigo';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { getModuleTitleForPath, moduleNavigation } from '../routes/navigation';

function MainLayoutInner() {
  const { user, logout, canAccessModule } = useAuth();
  const operacaoGuard = useAtendimentoOperacaoGuard();
  const navigate = useNavigate();
  const location = useLocation();
  const moduleTitle = getModuleTitleForPath(location.pathname);
  const visibleMenuItems = moduleNavigation.filter(
    (item) => canAccessModule(item.modulo) && !('hideInSidebar' in item && item.hideInSidebar),
  );
  const titularLinha = getTitularSistemaLinhaResumo();

  function handleSidebarNav(event: React.MouseEvent, to: string) {
    if (!operacaoGuard?.isActive) return;
    const destino = to.split('?')[0] ?? to;
    if (destino === location.pathname) return;
    event.preventDefault();
    operacaoGuard.requestLeaveConfirm(() => navigate(to));
  }

  function handleLogout() {
    operacaoGuard?.requestLeaveConfirm(logout);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
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

        <nav className="sidebar-nav">
          {visibleMenuItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={(event) => handleSidebarNav(event, item.to)}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {titularLinha ? (
          <div className="sidebar-titular-registro">
            <p className="sidebar-titular-registro__kicker">Registo no sistema</p>
            <p className="sidebar-titular-registro__text">{titularLinha}</p>
          </div>
        ) : null}
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-module-wrap">
            <p className="topbar-kicker">Módulo</p>
            <p className="topbar-module-title">{moduleTitle}</p>
          </div>

          <div className="topbar-right">
            <div className="topbar-session">
              <p className="topbar-kicker">Sessão ativa</p>
              <strong>{user?.nome ?? 'Utilizador'}</strong>
              <p className="panel-copy">Perfil: {user?.perfil.nome ?? '—'}</p>
            </div>
            <button className="ghost-button topbar-sair" onClick={handleLogout} type="button">
              Sair
            </button>
          </div>
        </header>

        <section className="page-content">
          <LocalStorageCorruptoBanner />
          <GlobalConsultaRapida />
          <Outlet />
        </section>
      </main>
    </div>
  );
}

export function MainLayout() {
  return (
    <AtendimentoOperacaoGuardProvider>
      <MainLayoutInner />
    </AtendimentoOperacaoGuardProvider>
  );
}
