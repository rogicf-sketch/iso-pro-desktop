import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { APP_VERSION } from '@/appMeta';
import { getTitularSistemaLinhaResumo } from '../../../lib/titularSistemaCodigo';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import {
  carregarListaTenantsNuvem,
  getActiveTenantId,
  setActiveTenantId,
  type IsoProTenantListItem,
} from '../../../lib/isoProTenant';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { isLocalMockAuthSeedEnabled, readRememberLoginPreference } from '../services/auth.service';
import { getFirstAccessibleRoute } from '../../../routes/navigation';

function IconEye() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m1 1 22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LoginPage() {
  const titularLinha = getTitularSistemaLinhaResumo();
  const { isAuthenticated, login, user } = useAuth();
  const [form, setForm] = useState({ login: '', senha: '' });
  const [permanecerLogado, setPermanecerLogado] = useState(() => readRememberLoginPreference());
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [tenantsNuvem, setTenantsNuvem] = useState<IsoProTenantListItem[]>([]);
  const [tenantSelectId, setTenantSelectId] = useState(() => getActiveTenantId());
  const [tenantListaErro, setTenantListaErro] = useState('');

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;
        const list = await carregarListaTenantsNuvem(supabase);
        if (cancelled) return;
        setTenantsNuvem(list);
        setTenantListaErro('');
        const cur = getActiveTenantId();
        if (list.length && !list.some((t) => t.id === cur)) {
          setActiveTenantId(list[0].id);
          setTenantSelectId(list[0].id);
        } else {
          setTenantSelectId(cur);
        }
      } catch {
        if (!cancelled) {
          setTenantListaErro('Não foi possível carregar a lista de empresas na nuvem. Verifique credenciais e se a migração multi-tenant foi aplicada.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isAuthenticated) {
    return <Navigate replace to={getFirstAccessibleRoute(user)} />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login({ ...form, permanecerLogado });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function preencherDemo(loginVal: string, senhaVal: string) {
    setForm({ login: loginVal, senha: senhaVal });
    setError('');
  }

  return (
    <div className="login-page">
      <header className="login-page__head">
        <h2 className="login-page__title" data-e2e="login-title">
          Entrar
        </h2>
        <p className="login-page__subtitle">Utilize as credenciais fornecidas pela sua organização.</p>
      </header>

      <form className="login-form" onSubmit={handleSubmit}>
        {hasSupabaseConfig() && tenantsNuvem.length > 0 ? (
          <label className="field login-field">
            <span>Empresa / organização</span>
            <select
              value={tenantSelectId}
              onChange={(event) => {
                const next = event.target.value;
                setTenantSelectId(next);
                setActiveTenantId(next);
              }}
            >
              {tenantsNuvem.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {tenantListaErro ? (
          <OperationalNotice tone="warning">{tenantListaErro}</OperationalNotice>
        ) : null}

        <label className="field login-field">
          <span>Login</span>
          <input
            autoComplete="username"
            onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
            placeholder="Ex.: nome.utilizador"
            value={form.login}
          />
        </label>

        <label className="field login-field">
          <span>Senha</span>
          <div className="login-password-wrap">
            <input
              autoComplete="current-password"
              onChange={(event) => setForm((current) => ({ ...current, senha: event.target.value }))}
              placeholder="••••••••"
              type={showPassword ? 'text' : 'password'}
              value={form.senha}
            />
            <button
              className="login-password-toggle"
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </label>

        <label className="login-remember">
          <input
            checked={permanecerLogado}
            onChange={(event) => setPermanecerLogado(event.target.checked)}
            type="checkbox"
          />
          <span>Permanecer logado</span>
        </label>
        <p className="login-remember__hint">
          Se não marcar, terá de entrar outra vez ao fechar o programa ou o navegador. Deixe desmarcado em computadores
          partilhados. Após 8 horas sem usar o sistema, a sessão expira de qualquer forma.
        </p>

        {error ? <div className="error-box">{error}</div> : null}

        {isLocalMockAuthSeedEnabled() ? (
          <div className="login-demo">
            <p className="login-demo__label">Ambiente de demonstração</p>
            <div className="login-demo__chips">
              <button type="button" className="login-chip" onClick={() => preencherDemo('admin', 'admin')}>
                Admin
              </button>
              <button type="button" className="login-chip" onClick={() => preencherDemo('planejamento', '1234')}>
                Planejamento
              </button>
              <button type="button" className="login-chip" onClick={() => preencherDemo('operacao', '1234')}>
                Operação
              </button>
              <button type="button" className="login-chip" onClick={() => preencherDemo('consulta', '1234')}>
                Consulta
              </button>
            </div>
            <p className="login-demo__hint">
              Selecione um perfil para preencher o utilizador e a palavra-passe; depois clique em Entrar.
            </p>
          </div>
        ) : (
          <OperationalNotice tone="neutral">
            Nesta instalação, os logins de demonstração estão desligados. Utilize as credenciais definidas no módulo{' '}
            <strong>Utilizadores</strong> (com Supabase) ou um build de testes com <code>VITE_ENABLE_LOCAL_MOCK_AUTH=true</code> no
            ficheiro <code>.env</code>.
          </OperationalNotice>
        )}

        <OperationalNotice tone="warning">
          Segurança: não partilhe credenciais. Marque «Permanecer logado» só em equipamentos de confiança.
        </OperationalNotice>

        <button className="primary-button login-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'A validar…' : 'Entrar'}
        </button>
      </form>

      <footer className="login-page__footer">
        <p>
          I.S.O PRO Desktop · versão <span className="login-page__version">{APP_VERSION}</span>
        </p>
        {titularLinha ? <p className="login-page__footer-titular">{titularLinha}</p> : null}
      </footer>
    </div>
  );
}
