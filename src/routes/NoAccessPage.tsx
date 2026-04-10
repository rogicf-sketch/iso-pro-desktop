import { OperationalNotice } from '../components/ui/OperationalNotice';
import { useAuth } from '../modules/auth/hooks/useAuth';

export function NoAccessPage() {
  const { user, logout } = useAuth();

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Acesso</p>
          <h2>Sem modulos liberados</h2>
        </div>
      </div>

      <p className="panel-copy">
        O usuario <strong>{user?.nome ?? 'atual'}</strong> esta autenticado, mas nao possui nenhum modulo com permissao de visualizacao.
      </p>

      <OperationalNotice tone="warning">
        Solicite ao administrador a liberacao de ao menos um modulo para continuar usando o sistema.
      </OperationalNotice>

      <div className="inline-actions">
        <button className="ghost-button" onClick={logout} type="button">
          Sair da sessao
        </button>
      </div>
    </div>
  );
}
