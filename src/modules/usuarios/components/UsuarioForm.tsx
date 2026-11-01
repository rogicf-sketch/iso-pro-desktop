import { useEffect, useMemo, useState } from 'react';
import { useModalFormDirty, useModalGuardedClose } from '../../../components/ui/modalFormGuard';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { isPlainFormDirty } from '../../../lib/isPlainFormDirty';
import { listarColaboradores } from '../../colaboradores/services/colaboradores.service';
import type { Colaborador } from '../../colaboradores/types/colaborador.types';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { Select } from '../../../components/ui/Select';
import type { AppModule, PermissionAction } from '../../auth/types/auth.types';
import { executarIsoProLinkAuthUser } from '../services/isoProLinkAuthUser.service';
import {
  getVolatileSessionPassword,
  setVolatileSessionPasswordAfterSuccessfulLogin,
} from '../../auth/services/auth.service';
import { isIsoProAdminUserEdgeConfigured } from '../services/isoProAdminUser.service';
import type { UsuarioFormData, UsuarioPerfil } from '../types/usuario.types';

const MODULO_LABELS: Record<AppModule, string> = {
  dashboard: 'Painel',
  fornecedores: 'Fornecedores',
  colaboradores: 'Colaboradores',
  materiais: 'Materiais',
  documentos: 'Documentos',
  recebimentos: 'Recebimentos',
  conferencia: 'Conferencia',
  etiquetas: 'Etiquetas',
  equipamentos: 'Equipamentos',
  configuracoes: 'Configuracoes',
  atendimento: 'Atendimento',
  inventario: 'Inventario',
  rir: 'RIR',
  rnc: 'RNC',
  relatorios: 'Relatorios',
  mobile: 'Mobile',
  usuarios: 'Usuarios',
};

function tituloModulo(modulo: AppModule): string {
  return MODULO_LABELS[modulo] ?? modulo;
}

function tituloAcao(acao: PermissionAction): string {
  if (acao === 'visualizar') return 'Visualizar';
  if (acao === 'editar') return 'Editar';
  return 'Administrar';
}

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
      <path d="M1 1l22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type Props = {
  initialValue: UsuarioFormData;
  profiles: UsuarioPerfil[];
  canAdminister: boolean;
  onCancel: () => void;
  onSubmit: (data: UsuarioFormData) => Promise<{ success: boolean; error?: string | undefined }>;
  /** Edicao de utilizador existente na nuvem: UI para ligar UUID do Supabase Auth. */
  enableSupabaseAuthLink?: boolean;
  remoteUsuarioId?: string | null;
  onAuthLinkUpdated?: () => Promise<void>;
};

export function UsuarioForm({
  initialValue,
  profiles,
  canAdminister,
  onCancel,
  onSubmit,
  enableSupabaseAuthLink = false,
  remoteUsuarioId = null,
  onAuthLinkUpdated,
}: Props) {
  const [form, setForm] = useState<UsuarioFormData>(initialValue);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [actorSenhaOk, setActorSenhaOk] = useState(() => Boolean(getVolatileSessionPassword()));
  const [actorSenhaSessao, setActorSenhaSessao] = useState('');
  const [showActorPassword, setShowActorPassword] = useState(false);
  const guardedCancel = useModalGuardedClose(onCancel);
  useModalFormDirty(isPlainFormDirty(initialValue, form));
  const [authLinkDraft, setAuthLinkDraft] = useState('');
  const [authLinkBusy, setAuthLinkBusy] = useState(false);
  const [authLinkError, setAuthLinkError] = useState('');
  const isInactive = !form.ativo;
  const hasAnyPermission = form.permissoes.some((item) => item.permitido);
  const needsActorSenha = isIsoProAdminUserEdgeConfigured() && !actorSenhaOk;

  const showAuthLinkPanel = Boolean(enableSupabaseAuthLink && remoteUsuarioId);

  useEffect(() => {
    void listarColaboradores({
      busca: '',
      tipo: 'todos',
      status: 'todos',
      page: 1,
      pageSize: 10000,
    }).then((res) => {
      if (res.success && res.data) setColaboradores(res.data.items);
    });
  }, []);

  const colaboradoresParaSelect = useMemo(() => {
    const list = colaboradores.filter((c) => c.ativo || c.id === form.colaboradorId);
    return [...list].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [colaboradores, form.colaboradorId]);

  const opcoesColaboradorSearch = useMemo(
    () =>
      colaboradoresParaSelect.map((c) => ({
        value: c.id,
        label: `${c.nome} — mat. ${c.matricula?.trim() || '—'} — ${c.funcao?.trim() || '—'}`,
      })),
    [colaboradoresParaSelect],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (needsActorSenha) {
      const confirmacao = actorSenhaSessao.trim();
      if (!confirmacao) {
        setError('Informe a senha da sua sessao (administrador) para gravar na nuvem.');
        return;
      }
      setVolatileSessionPasswordAfterSuccessfulLogin(confirmacao);
      setActorSenhaOk(true);
    }
    setSubmitting(true);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar usuario.');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  function handleSelectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    setForm((current) => ({
      ...current,
      perfilId: profileId,
      permissoes: profile ? profile.permissoes.map((item) => ({ ...item })) : current.permissoes,
    }));
  }

  function handleColaboradorChange(colaboradorId: string) {
    if (!colaboradorId) {
      setForm((current) => ({ ...current, colaboradorId: null }));
      return;
    }
    const col = colaboradores.find((c) => c.id === colaboradorId);
    setForm((current) => ({
      ...current,
      colaboradorId,
      nome: col ? col.nome.trim() : current.nome,
    }));
  }

  function toggleModulo(modulo: UsuarioFormData['permissoes'][number]['modulo']) {
    setForm((current) => ({
      ...current,
      permissoes: current.permissoes.map((item) =>
        item.modulo === modulo ? { ...item, permitido: !item.permitido } : item,
      ),
    }));
  }

  function togglePermissao(
    modulo: UsuarioFormData['permissoes'][number]['modulo'],
    acao: UsuarioFormData['permissoes'][number]['acao'],
  ) {
    setForm((current) => ({
      ...current,
      permissoes: current.permissoes.map((item) => {
        if (item.modulo !== modulo || item.acao !== acao) return item;
        return { ...item, permitido: !item.permitido };
      }),
    }));
  }

  async function handleAuthLink(setUuid: string | null) {
    if (!remoteUsuarioId) return;
    setAuthLinkError('');
    setAuthLinkBusy(true);
    const cfg = readConfiguracoes();
    const res = await executarIsoProLinkAuthUser({
      usuarioId: remoteUsuarioId,
      authUserId: setUuid,
      secret: cfg.isoProLinkAuthSecret,
      usuarioLogin: form.login,
    });
    setAuthLinkBusy(false);
    if (!res.success) {
      setAuthLinkError(res.error ?? 'Falha ao atualizar ligacao.');
      return;
    }
    setAuthLinkDraft('');
    await onAuthLinkUpdated?.();
  }

  function applyPermissionPreset(mode: 'all' | 'readOnly' | 'none') {
    setForm((current) => ({
      ...current,
      permissoes: current.permissoes.map((item) => ({
        ...item,
        permitido:
          mode === 'all'
            ? true
            : mode === 'readOnly'
              ? item.acao === 'visualizar'
              : false,
      })),
    }));
  }

  const modulosAgrupados = Array.from(new Set(form.permissoes.map((item) => item.modulo))).map((modulo) => ({
    modulo,
    permissoes: form.permissoes.filter((item) => item.modulo === modulo),
  }));

  return (
    <form className="stack-grid" onSubmit={handleSubmit}>
      <ModuleHelp>
        <OperationalNotice tone="warning">
          Regra de seguranca: cada usuario deve receber apenas os modulos e acoes estritamente necessarios para a sua funcao.
        </OperationalNotice>
      </ModuleHelp>
      {isInactive ? (
        <OperationalNotice tone="critical">
          Usuario marcado como inativo: novos acessos devem permanecer bloqueados ate reativacao administrativa.
        </OperationalNotice>
      ) : null}
      {!hasAnyPermission ? (
        <OperationalNotice tone="warning">
          Nenhuma permissao liberada no momento. Se salvar assim, o usuario podera ficar sem acesso operacional ao sistema.
        </OperationalNotice>
      ) : null}
      <ModuleHelp>
        <OperationalNotice>
          Vinculo opcional: pesquise o colaborador pelo nome, matricula, funcao ou iniciais (ex.: «js» para Joao Silva). Limpe o campo para
          «Nenhum» — contas tecnicas, consultoria ou quando nao houver colaborador correspondente.
        </OperationalNotice>
      </ModuleHelp>
      <div className="form-columns">
        <SearchableSelect
          label="Colaborador (opcional)"
          onChange={handleColaboradorChange}
          options={opcoesColaboradorSearch}
          placeholder="Digite para filtrar — limpar o campo = sem vinculo"
          value={form.colaboradorId ?? ''}
        />
      </div>
      <div className="form-columns">
        <Input
          label="Nome"
          onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
          value={form.nome}
        />
        <Input
          label="Login"
          onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
          value={form.login}
        />
        <label className="field">
          <span>Senha</span>
          <div className="login-password-wrap">
            <input
              autoComplete="new-password"
              className="input-control"
              onChange={(event) => setForm((current) => ({ ...current, senha: event.target.value }))}
              placeholder="Preencha para novo usuario ou troca de senha"
              type={showPassword ? 'text' : 'password'}
              value={form.senha}
            />
            <button
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              className="login-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              type="button"
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </label>
      </div>

      {needsActorSenha ? (
        <>
          <OperationalNotice tone="warning">
            Apos actualizar a pagina, a senha do administrador nao fica em memoria. Confirme a senha da sua sessao
            abaixo (a mesma com que entrou) para criar ou editar utilizadores na nuvem.
          </OperationalNotice>
          <label className="field">
            <span>Senha da sua sessao (administrador)</span>
            <div className="login-password-wrap">
              <input
                autoComplete="current-password"
                className="input-control"
                onChange={(event) => setActorSenhaSessao(event.target.value)}
                placeholder="Senha com que entrou neste posto"
                type={showActorPassword ? 'text' : 'password'}
                value={actorSenhaSessao}
              />
              <button
                aria-label={showActorPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showActorPassword}
                className="login-password-toggle"
                onClick={() => setShowActorPassword((v) => !v)}
                title={showActorPassword ? 'Ocultar senha' : 'Mostrar senha'}
                type="button"
              >
                {showActorPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </label>
        </>
      ) : null}

      {showAuthLinkPanel ? (
        <div className="section-block">
          <h3 className="usuario-perm-heading">Supabase Auth (JWT / tenant)</h3>
          {form.ativo && !form.authUserIdSupabase ? (
            <OperationalNotice tone="critical">
              Utilizador <strong>activo sem ligacao Auth</strong> — com cutover JWT nao consegue entrar. Cole o UUID
              do Authentication e clique em <strong>Ligar</strong>, ou recrie o utilizador (provisionamento automatico
              no create).
            </OperationalNotice>
          ) : null}
          <OperationalNotice tone="warning">
            Liga este utilizador da base (<code>usuarios_sistema</code>) ao UUID criado em Authentication. O segredo da funcao fica em Configuracoes
            &gt; Supabase; guarde-o apenas em postos de administracao confiaveis. Novos utilizadores criados pela Edge
            recebem Auth automaticamente (<code>login@isopro.local</code>).
          </OperationalNotice>
          <p className="panel-copy">
            <strong>Tenant activo:</strong> <code>{getActiveTenantId()}</code>
          </p>
          <p className="panel-copy">
            <strong>Auth user id atual:</strong>{' '}
            {form.authUserIdSupabase ? <code>{form.authUserIdSupabase}</code> : <span>(sem ligacao)</span>}
          </p>
          {canAdminister ? (
            <>
              <div className="form-columns">
                <Input
                  label="UUID Supabase Auth (colar)"
                  onChange={(event) => setAuthLinkDraft(event.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={authLinkDraft}
                />
              </div>
              {authLinkError ? <div className="error-box">{authLinkError}</div> : null}
              <div className="inline-actions">
                <Button
                  disabled={authLinkBusy || !authLinkDraft.trim()}
                  onClick={() => void handleAuthLink(authLinkDraft.trim())}
                  type="button"
                >
                  {authLinkBusy ? 'A ligar...' : 'Ligar'}
                </Button>
                <Button
                  disabled={authLinkBusy || !form.authUserIdSupabase}
                  onClick={() => void handleAuthLink(null)}
                  type="button"
                  variant="ghost"
                >
                  Remover ligacao
                </Button>
              </div>
            </>
          ) : (
            <p className="panel-copy">Apenas perfis com permissao de administrar utilizadores podem alterar esta ligacao.</p>
          )}
        </div>
      ) : null}

      <div className="form-columns">
        <Select
          label="Perfil"
          onChange={(event) => handleSelectProfile(event.target.value)}
          value={form.perfilId}
        >
          <option value="">Selecione</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.nome}
            </option>
          ))}
        </Select>

        <Select
          label="Status"
          onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.value === 'true' }))}
          value={String(form.ativo)}
        >
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </div>

      <section className="section-block usuario-perm-section" aria-labelledby="usuario-perm-heading">
        <div className="usuario-perm-intro">
          <h3 className="usuario-perm-heading" id="usuario-perm-heading">
            Modulos liberados
          </h3>
          <p className="panel-copy">
            Defina por modulo se o usuario pode <strong>visualizar</strong>, <strong>editar</strong> ou{' '}
            <strong>administrar</strong>. Toque em cada permissao para ligar ou desligar.
          </p>
        </div>
        {canAdminister ? (
          <div className="usuario-perm-presets" role="group" aria-label="Atalhos de permissoes">
            <Button onClick={() => applyPermissionPreset('all')} variant="ghost">
              Liberar tudo
            </Button>
            <Button onClick={() => applyPermissionPreset('readOnly')} variant="ghost">
              Somente leitura
            </Button>
            <Button onClick={() => applyPermissionPreset('none')} variant="ghost">
              Limpar tudo
            </Button>
          </div>
        ) : null}
        <div className="usuario-perm-grid">
          {modulosAgrupados.map(({ modulo, permissoes }) => {
            const moduloAtivo = permissoes.some((item) => item.permitido);
            const visivel = permissoes.find((item) => item.acao === 'visualizar')?.permitido;
            return (
              <article
                className={`usuario-perm-card${moduloAtivo ? ' usuario-perm-card--ativo' : ''}`}
                key={modulo}
              >
                <div className="usuario-perm-card__head">
                  <span className="usuario-perm-card__modulo">{tituloModulo(modulo)}</span>
                  <span className={`usuario-perm-status${visivel ? ' usuario-perm-status--on' : ' usuario-perm-status--off'}`}>
                    {visivel ? 'Liberado' : 'Bloqueado'}
                  </span>
                </div>
                <Button
                  className="usuario-perm-toggle-modulo"
                  disabled={!canAdminister}
                  onClick={() => toggleModulo(modulo)}
                  type="button"
                  variant="ghost"
                >
                  Alternar modulo
                </Button>
                <div className="usuario-perm-chips" role="group" aria-label={`Permissoes: ${tituloModulo(modulo)}`}>
                  {permissoes.map((permissao) => (
                    <button
                      className={`usuario-perm-chip${permissao.permitido ? ' usuario-perm-chip--on' : ' usuario-perm-chip--off'}`}
                      disabled={!canAdminister}
                      key={`${permissao.modulo}-${permissao.acao}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        togglePermissao(permissao.modulo, permissao.acao);
                      }}
                      type="button"
                    >
                      {tituloAcao(permissao.acao)}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
        {!canAdminister ? (
          <p className="panel-copy usuario-perm-footnote">
            Somente perfis com permissao de administrar podem alterar as acoes finas deste modulo.
          </p>
        ) : null}
      </section>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="inline-actions">
        <Button disabled={submitting} type="submit">
          {submitting ? 'Salvando...' : 'Salvar usuario'}
        </Button>
        <Button onClick={guardedCancel} variant="ghost">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
