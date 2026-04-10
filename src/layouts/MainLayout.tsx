import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { moduleNavigation } from '../routes/navigation';

export function MainLayout() {
  const { user, logout, canAccessModule } = useAuth();
  const visibleMenuItems = moduleNavigation.filter((item) => canAccessModule(item.modulo));

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
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="topbar-kicker">Sessão ativa</p>
            <strong>{user?.nome ?? 'Usuario'}</strong>
            <p className="panel-copy">Perfil: {user?.perfil.nome ?? '-'}</p>
          </div>

          <button className="ghost-button" onClick={logout} type="button">
            Sair
          </button>
        </header>

        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
