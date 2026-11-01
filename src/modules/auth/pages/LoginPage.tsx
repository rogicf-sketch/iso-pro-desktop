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
import { traduzirErroOperacionalIsoPro } from '../../../lib/traduzirErroOperacionalIsoPro';
import { getSupabase, getSupabaseOperationalStatus, hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
  isIsoProMfaEnrollRequiredError,
  isIsoProMfaRequiredError,
  isLocalMockAuthSeedEnabled,
  readRememberLoginPreference,
} from '../services/auth.service';
import type { AuthUser } from '../types/auth.types';
import { getFirstAccessibleRoute } from '../../../routes/navigation';
import {
  getIsoProAuthSessionEmail,
  startIsoProMfaTotpEnrollForLogin,
  type IsoProMfaEnrollStart,
} from '../../../lib/isoProMfa';

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
  const { isAuthenticated, login, completeMfaLogin, cancelMfaLogin, user } = useAuth();
  const [form, setForm] = useState({ login: '', senha: '' });
  const [permanecerLogado, setPermanecerLogado] = useState(() => readRememberLoginPreference());
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [tenantsNuvem, setTenantsNuvem] = useState<IsoProTenantListItem[]>([]);
  const [tenantSelectId, setTenantSelectId] = useState(() => getActiveTenantId());
  const [tenantListaErro, setTenantListaErro] = useState('');
  const [mfaPending, setMfaPending] = useState<{
    factorId: string;
    pendingUser: AuthUser;
    permanecerLogado: boolean;
  } | null>(null);
  const [mfaEnroll, setMfaEnroll] = useState<{
    pendingUser: AuthUser;
    permanecerLogado: boolean;
    start: IsoProMfaEnrollStart | null;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) {
          if (!cancelled && getSupabaseOperationalStatus() === 'partial') {
            setTenantListaErro('Configuração da nuvem incompleta neste equipamento.');
          }
          return;
        }
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
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : '';
          const rede = /failed to fetch|fetch failed|network|timeout|econnrefused/i.test(msg);
          setTenantListaErro(
            rede ? traduzirErroOperacionalIsoPro(msg) : 'Não foi possível carregar as empresas.',
          );
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
      if (mfaPending) {
        await completeMfaLogin(
          mfaPending.factorId,
          mfaCode,
          mfaPending.pendingUser,
          mfaPending.permanecerLogado,
        );
        setMfaPending(null);
        setMfaCode('');
        return;
      }
      if (mfaEnroll?.start) {
        await completeMfaLogin(
          mfaEnroll.start.factorId,
          mfaCode,
          mfaEnroll.pendingUser,
          mfaEnroll.permanecerLogado,
          { enroll: true },
        );
        setMfaEnroll(null);
        setMfaCode('');
        return;
      }
      await login({ ...form, permanecerLogado });
    } catch (err) {
      if (isIsoProMfaRequiredError(err)) {
        setMfaPending({
          factorId: err.factorId,
          pendingUser: err.pendingUser,
          permanecerLogado: err.permanecerLogado,
        });
        setMfaEnroll(null);
        setError('');
        return;
      }
      if (isIsoProMfaEnrollRequiredError(err)) {
        setMfaPending(null);
        setMfaEnroll({
          pendingUser: err.pendingUser,
          permanecerLogado: err.permanecerLogado,
          start: null,
        });
        setError('');
        try {
          await getIsoProAuthSessionEmail();
          const start = await startIsoProMfaTotpEnrollForLogin(`I.S.O PRO · ${err.pendingUser.login}`);
          setMfaEnroll({
            pendingUser: err.pendingUser,
            permanecerLogado: err.permanecerLogado,
            start,
          });
        } catch (enrollErr) {
          setMfaEnroll(null);
          setError(enrollErr instanceof Error ? enrollErr.message : 'Nao foi possivel iniciar o MFA.');
          cancelMfaLogin();
        }
        return;
      }
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function preencherDemo(loginVal: string, senhaVal: string) {
    setForm({ login: loginVal, senha: senhaVal });
    setError('');
  }

  function cancelarMfa() {
    cancelMfaLogin();
    setMfaPending(null);
    setMfaEnroll(null);
    setMfaCode('');
    setError('');
  }

  return (
    <div className="login-page">
      <header className="login-page__head">
        <h2 className="login-page__title" data-e2e="login-title">
          Entrar
        </h2>
        <p className="login-page__subtitle">
          {mfaEnroll
            ? 'Escaneie o QR e confirme o código de 6 dígitos.'
            : mfaPending
              ? 'Código de verificação de 6 dígitos.'
              : 'Aceda com a sua conta.'}
        </p>
      </header>

      <form className="login-form" onSubmit={handleSubmit}>
        {mfaEnroll ? (
          <>
            {!mfaEnroll.start ? (
              <p className="login-page__subtitle">A preparar verificação…</p>
            ) : (
              <>
                <div className="login-mfa-enroll-qr">
                  <img alt="QR de autenticação" src={mfaEnroll.start.qrCode} />
                </div>
                <label className="field login-field">
                  <span>Código</span>
                  <input
                    autoComplete="one-time-code"
                    data-e2e="login-mfa-enroll-code"
                    inputMode="numeric"
                    maxLength={8}
                    onChange={(event) => setMfaCode(event.target.value)}
                    placeholder="000000"
                    value={mfaCode}
                  />
                </label>
              </>
            )}
            {error ? (
              <div className="error-box" data-e2e="login-error">
                {error}
              </div>
            ) : null}
            <button
              className="primary-button login-submit"
              data-e2e="login-submit"
              disabled={isSubmitting || !mfaEnroll.start}
              type="submit"
            >
              {isSubmitting ? 'A verificar…' : 'Confirmar e entrar'}
            </button>
            <button className="button button-ghost" disabled={isSubmitting} type="button" onClick={cancelarMfa}>
              Voltar
            </button>
          </>
        ) : mfaPending ? (
          <>
            <label className="field login-field">
              <span>Código</span>
              <input
                autoComplete="one-time-code"
                data-e2e="login-mfa-code"
                inputMode="numeric"
                maxLength={8}
                onChange={(event) => setMfaCode(event.target.value)}
                placeholder="000000"
                value={mfaCode}
              />
            </label>
            {error ? (
              <div className="error-box" data-e2e="login-error">
                {error}
              </div>
            ) : null}
            <button className="primary-button login-submit" data-e2e="login-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'A verificar…' : 'Continuar'}
            </button>
            <button className="button button-ghost" disabled={isSubmitting} type="button" onClick={cancelarMfa}>
              Voltar
            </button>
          </>
        ) : (
          <>
        {hasSupabaseConfig() && tenantsNuvem.length > 0 ? (
          <label className="field login-field">
            <span>Empresa / organização</span>
            <select
              className="input-control login-tenant-select"
              data-e2e="login-tenant"
              value={tenantSelectId}
              onChange={(event) => {
                const next = event.target.value;
                setTenantSelectId(next);
                setActiveTenantId(next);
              }}
            >
              {tenantsNuvem.map((t) => {
                const label = t.slug ? `${t.name} (${t.slug})` : t.name;
                return (
                  <option key={t.id} title={label} value={t.id}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}
        {!hasSupabaseConfig() ? (
          <OperationalNotice tone="warning">Ligação à nuvem indisponível neste equipamento.</OperationalNotice>
        ) : null}
        {tenantListaErro ? <OperationalNotice tone="warning">{tenantListaErro}</OperationalNotice> : null}

        <label className="field login-field">
          <span>Login</span>
          <input
            autoComplete="username"
            data-e2e="login-usuario"
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
              data-e2e="login-senha"
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

        <label
          className="login-remember"
          title="Em equipamentos partilhados, deixe desmarcado. A sessão expira após 8 h sem uso."
        >
          <input
            checked={permanecerLogado}
            onChange={(event) => setPermanecerLogado(event.target.checked)}
            type="checkbox"
          />
          <span>Permanecer logado</span>
        </label>

        {error ? (
          <div className="error-box" data-e2e="login-error">
            {error}
          </div>
        ) : null}

        {isLocalMockAuthSeedEnabled() ? (
          <div className="login-demo">
            <p className="login-demo__label">Demonstração</p>
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
          </div>
        ) : null}

        <button className="primary-button login-submit" data-e2e="login-submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'A validar…' : 'Entrar'}
        </button>
          </>
        )}
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
