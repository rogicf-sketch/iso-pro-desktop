import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { tentarRepararCacheMateriaisLocalNaEntrada } from '../modules/materiais/services/materiais.service';
import { tentarAutoSyncEscalaNuvemNaEntrada } from '../lib/escalaNuvemAutoSync';
import { AppVersionOutdatedBanner } from '@/components/AppVersionOutdatedBanner';
import { LocalStorageCorruptoBanner } from '@/components/LocalStorageCorruptoBanner';
import { SnapshotSessionBanner } from '@/components/SnapshotSessionBanner';
import { SessionCloudStaleBanner } from '@/components/SessionCloudStaleBanner';
import { GlobalConsultaRapida } from '@/components/GlobalConsultaRapida';
import { AtendimentoOperacaoGuardProvider } from '../modules/atendimento/context/AtendimentoOperacaoGuard';
import { useAtendimentoOperacaoGuard } from '../modules/atendimento/context/atendimentoOperacaoGuard.hooks';
import { getTitularSistemaLinhaResumo } from '../lib/titularSistemaCodigo';
import { getSidebarMarcaEfetiva, type SidebarMarcaId } from '../lib/sidebarMarca';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { AlterarMinhaSenhaModal } from '../modules/auth/components/AlterarMinhaSenhaModal';
import { useMenuBadgeCounts } from '../modules/dashboard/hooks/useMenuBadgeCounts';
import { MENU_BADGE_BY_ROUTE } from '../modules/dashboard/utils/pendenciasOperacionais.utils';
import { getModuleTitleForPath, moduleNavigation } from '../routes/navigation';
import { SidebarBrand } from '../components/SidebarBrand';
import { SidebarNavIcon } from '../components/SidebarNavIcon';
import { PageChromeProvider, usePageChromeContext } from './PageChromeContext';

function MainLayoutInner() {
  const { user, logout, canAccessModule } = useAuth();
  const operacaoGuard = useAtendimentoOperacaoGuard();
  const { counts: menuBadges } = useMenuBadgeCounts();
  const { chrome } = usePageChromeContext();
  const navigate = useNavigate();
  const location = useLocation();
  const routeTitle = getModuleTitleForPath(location.pathname);
  const pageTitle = chrome.title?.trim() || routeTitle;
  const pageMeta = chrome.meta?.trim() || '';
  const visibleMenuItems = moduleNavigation.filter(
    (item) => canAccessModule(item.modulo) && !('hideInSidebar' in item && item.hideInSidebar),
  );
  const titularLinha = getTitularSistemaLinhaResumo();
  const [senhaModalOpen, setSenhaModalOpen] = useState(false);
  const [sidebarMarca, setSidebarMarca] = useState<SidebarMarcaId>(() => getSidebarMarcaEfetiva());

  useEffect(() => {
    void tentarRepararCacheMateriaisLocalNaEntrada();
    void tentarAutoSyncEscalaNuvemNaEntrada();
  }, []);

  useEffect(() => {
    setSidebarMarca(getSidebarMarcaEfetiva());
    const onMarca = () => setSidebarMarca(getSidebarMarcaEfetiva());
    window.addEventListener('iso-pro-sidebar-marca', onMarca);
    return () => window.removeEventListener('iso-pro-sidebar-marca', onMarca);
  }, [user?.login]);

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
        <SidebarBrand marca={sidebarMarca} />

        <nav className="sidebar-nav">
          {visibleMenuItems.map((item) => {
            const badgeKey = MENU_BADGE_BY_ROUTE[item.to];
            const badgeCount = badgeKey ? menuBadges[badgeKey] : 0;
            return (
              <NavLink
                key={item.to}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                onClick={(event) => handleSidebarNav(event, item.to)}
                to={item.to}
              >
                <span className="sidebar-link__main">
                  <SidebarNavIcon className="sidebar-link__icon" to={item.to} />
                  <span className="sidebar-link__label">{item.label}</span>
                </span>
                {badgeCount > 0 ? (
                  <span aria-label={`${badgeCount} pendencia(s)`} className="sidebar-link__badge" title={`${badgeCount} pendencia(s)`}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        {titularLinha ? (
          <div className="sidebar-titular-registro">
            <p className="sidebar-titular-registro__kicker">Registo no sistema</p>
            <p className="sidebar-titular-registro__text">{titularLinha}</p>
          </div>
        ) : null}
      </aside>

      <main className="main-content">
        <header className="topbar topbar--app">
          <div className="topbar-title-block">
            <h1 className="topbar-page-title">{pageTitle}</h1>
            {pageMeta ? <p className="topbar-page-meta">{pageMeta}</p> : null}
          </div>

          <div className="topbar-right topbar-right--end">
            <div className="topbar-session topbar-session--compact" title={`Perfil: ${user?.perfil.nome ?? '—'}`}>
              <span className="topbar-session-name">{user?.nome ?? 'Utilizador'}</span>
              {user?.perfil.nome &&
              user.perfil.nome.trim().toLowerCase() !== (user.nome ?? '').trim().toLowerCase() ? (
                <span className="topbar-session-role">{user.perfil.nome}</span>
              ) : null}
            </div>
            <button
              className="ghost-button topbar-sair"
              onClick={() => setSenhaModalOpen(true)}
              type="button"
            >
              Alterar senha
            </button>
            <button className="ghost-button topbar-sair" onClick={handleLogout} type="button">
              Sair
            </button>
          </div>
        </header>

        <section className="page-content">
          <AppVersionOutdatedBanner />
          <LocalStorageCorruptoBanner />
          <SnapshotSessionBanner />
          <SessionCloudStaleBanner />
          <GlobalConsultaRapida />
          <Outlet />
        </section>
      </main>

      <AlterarMinhaSenhaModal open={senhaModalOpen} onClose={() => setSenhaModalOpen(false)} />
    </div>
  );
}

export function MainLayout() {
  return (
    <AtendimentoOperacaoGuardProvider>
      <PageChromeProvider>
        <MainLayoutInner />
      </PageChromeProvider>
    </AtendimentoOperacaoGuardProvider>
  );
}
