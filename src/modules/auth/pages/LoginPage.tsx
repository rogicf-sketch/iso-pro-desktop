import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { useAuth } from '../hooks/useAuth';
import { getFirstAccessibleRoute } from '../../../routes/navigation';

export function LoginPage() {
  const { isAuthenticated, login, user } = useAuth();
  const [form, setForm] = useState({ login: '', senha: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate replace to={getFirstAccessibleRoute(user)} />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel entrar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>Login</span>
        <input
          autoComplete="username"
          onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
          placeholder="Digite seu login"
          value={form.login}
        />
      </label>

      <label className="field">
        <span>Senha</span>
        <input
          autoComplete="current-password"
          onChange={(event) => setForm((current) => ({ ...current, senha: event.target.value }))}
          placeholder="Digite sua senha"
          type="password"
          value={form.senha}
        />
      </label>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="info-card">
        <strong>Perfis de teste</strong>
        <p className="panel-copy">`admin/admin` acesso total.</p>
        <p className="panel-copy">`planejamento/1234` foco em materiais, documentos e relatorios.</p>
        <p className="panel-copy">`operacao/1234` foco em recebimentos, atendimento, inventario, qualidade e mobile.</p>
        <p className="panel-copy">`consulta/1234` acesso apenas a dashboard e relatorios.</p>
      </div>

      <OperationalNotice tone="warning">
        Seguranca: o login nao vem mais preenchido automaticamente. Use apenas credenciais autorizadas.
      </OperationalNotice>

      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
