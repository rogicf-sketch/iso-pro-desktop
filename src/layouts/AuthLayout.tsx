import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <p className="auth-kicker">I.S.O PRO</p>
          <h1>Sistema Desktop</h1>
          <p>Base inicial da Sprint 1 com login, rotas protegidas e estrutura pronta para os modulos.</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
