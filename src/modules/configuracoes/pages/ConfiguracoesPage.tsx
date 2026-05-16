import { useEffect, useMemo, useRef, useState } from 'react';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { normalizarUrlAssetPublicParaAmbiente } from '../../../lib/logoInstitucional';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { useAuth } from '../../auth/hooks/useAuth';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { logout as authLogout, verifyCurrentUserPassword } from '../../auth/services/auth.service';
import { RIR_NUMERACAO_LABELS, descricaoModoNumeracaoRir } from '../../qualidade/utils/rirNumeracaoCopy';
import { useConfiguracoes } from '../hooks/useConfiguracoes';
import { LIMPAR_CADASTROS_FRASE_LOCAL, LIMPAR_CADASTROS_FRASE_NUVEM } from '../constants/limparCadastros.constants';
import {
  PURGE_CLOUD_FRASE_OPERACIONAL,
  PURGE_CLOUD_FRASE_UTILIZADORES,
} from '../constants/purgeCloud.constants';
import { descarregarPacoteBackupAdministrativo } from '../services/pacoteBackupAdministrativo.service';
import { executarLimpezaLocalFabricaIsoPro } from '../services/fabricaLimpezaLocal.service';
import { executarLimpezaCadastrosLocal } from '../services/limpezaCadastrosLocal.service';
import { executarPurgeCadastrosNuvem } from '../services/purgeCadastrosNuvem.service';
import { executarPurgeNuvemIsoPro } from '../services/purgeNuvemIsoPro.service';
import {
  adicionarAmbienteObra,
  aplicarAmbienteAtivoERecarregar,
  readEstadoAmbientes,
  removerAmbienteObra,
} from '../../../lib/isoProAmbiente';
import {
  aplicarTenantAtivoERecarregar,
  carregarListaTenantsNuvem,
  getActiveTenantId,
  type IsoProTenantListItem,
} from '../../../lib/isoProTenant';
import { getSupabase, getSupabaseConfigDiagnostics, hasSupabaseConfig } from '../../../lib/supabase';
import type { ConfiguracaoSistema } from '../types/configuracao.types';
import {
  aplicarTemaEfetivoNaSessao,
  limparUsuarioTemaPreferido,
  readTemaEfetivoParaSessao,
  readUsuarioTemaPreferido,
  salvarUsuarioTemaPreferido,
} from '../services/configuracoes.service';

export function ConfiguracoesPage() {
  const { canAccessAction, user } = useAuth();
  const {
    form,
    loading,
    error,
    success,
    setSuccess,
    runtimeSupabase,
    hasCloudConfig,
    cloudMaterialsEnabled,
    desktopSecurity,
    desktopLicenseRegistryStatus,
    desktopLicenseHealth,
    setForm,
    autorizarInstalacaoAtual,
    desativarVinculoDesktop,
    importarLicencaDesktop,
    limparLicencaDesktop,
    revogarLicencaDesktop,
    reativarLicencaDesktop,
    submit,
  } = useConfiguracoes();
  const canAdminister = canAccessAction('configuracoes', 'administrar');
  /** Força releitura de `readUsuarioTemaPreferido` após gravar ou limpar preferência. */
  const [temaPreferenciaTick, setTemaPreferenciaTick] = useState(0);
  const temaPreferidoUsuario = useMemo(() => {
    void user?.login;
    void temaPreferenciaTick;
    return readUsuarioTemaPreferido();
  }, [user?.login, temaPreferenciaTick]);
  const temaEfetivoSessao = useMemo(() => {
    void form?.tema;
    void user?.login;
    void temaPreferenciaTick;
    return readTemaEfetivoParaSessao();
  }, [form?.tema, user?.login, temaPreferenciaTick]);
  const [logoUploadError, setLogoUploadError] = useState('');
  const maxLogoBytes = Math.floor(1.5 * 1024 * 1024);

  const supabaseDiag = useMemo(() => getSupabaseConfigDiagnostics(), []);
  /** URL/chave efectivas vêm do build (`VITE_*`): não pedir cópia nas Configurações (evita divergência e gravação redundante). */
  const supabaseCredenciaisFixasNoDeploy =
    supabaseDiag.urlFrom === 'vite-env' && supabaseDiag.keyFrom === 'vite-env';

  const [fabricaModalOpen, setFabricaModalOpen] = useState(false);
  const [fabricaBackupOk, setFabricaBackupOk] = useState(false);
  const [fabricaEntendoOk, setFabricaEntendoOk] = useState(false);
  const [fabricaSenha, setFabricaSenha] = useState('');
  const [fabricaErro, setFabricaErro] = useState('');
  const [fabricaBackupBusy, setFabricaBackupBusy] = useState(false);
  const [fabricaLimpezaBusy, setFabricaLimpezaBusy] = useState('');
  const [fabricaBackupResumo, setFabricaBackupResumo] = useState('');

  const [nuvemModalOpen, setNuvemModalOpen] = useState(false);
  const [nuvemFraseOperacional, setNuvemFraseOperacional] = useState('');
  const [nuvemFraseUtilizadores, setNuvemFraseUtilizadores] = useState('');
  const [nuvemIncluirUtilizadores, setNuvemIncluirUtilizadores] = useState(false);
  const [nuvemSenha, setNuvemSenha] = useState('');
  const [nuvemErro, setNuvemErro] = useState('');
  const [nuvemBusy, setNuvemBusy] = useState('');
  const [nuvemSucesso, setNuvemSucesso] = useState('');

  const [cadastroLocalModalOpen, setCadastroLocalModalOpen] = useState(false);
  const [cadastroLocalFrase, setCadastroLocalFrase] = useState('');
  const [cadastroLocalSenha, setCadastroLocalSenha] = useState('');
  const [cadastroLocalErro, setCadastroLocalErro] = useState('');
  const [cadastroLocalBusy, setCadastroLocalBusy] = useState('');
  const [cadastroLocalOk, setCadastroLocalOk] = useState('');

  const [cadastroNuvemModalOpen, setCadastroNuvemModalOpen] = useState(false);
  const [cadastroNuvemFrase, setCadastroNuvemFrase] = useState('');
  const [cadastroNuvemSenha, setCadastroNuvemSenha] = useState('');
  const [cadastroNuvemErro, setCadastroNuvemErro] = useState('');
  const [cadastroNuvemBusy, setCadastroNuvemBusy] = useState('');
  const [cadastroNuvemOk, setCadastroNuvemOk] = useState('');
  /** Mensagem final na modal de fabrica antes do redirect para login. */
  const [fabricaSucesso, setFabricaSucesso] = useState('');
  /** Purge na nuvem com utilizadores: mensagem na modal antes de terminar sessao. */
  const [nuvemFeitoMsg, setNuvemFeitoMsg] = useState('');

  const [ambientesUi, setAmbientesUi] = useState(readEstadoAmbientes);
  const [novoAmbienteNome, setNovoAmbienteNome] = useState('');
  const [ambienteFormErro, setAmbienteFormErro] = useState('');
  const [tenantsNuvemCfg, setTenantsNuvemCfg] = useState<IsoProTenantListItem[]>([]);
  const [tenantCfgSelect, setTenantCfgSelect] = useState(() => getActiveTenantId());

  const adminSucessoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (cadastroLocalOk || cadastroNuvemOk || nuvemSucesso) {
      window.requestAnimationFrame(() => {
        adminSucessoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [cadastroLocalOk, cadastroNuvemOk, nuvemSucesso]);

  useEffect(() => {
    if (!canAdminister || !hasSupabaseConfig()) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (!supabase) return;
        const list = await carregarListaTenantsNuvem(supabase);
        if (!cancelled) {
          setTenantsNuvemCfg(list);
          setTenantCfgSelect(getActiveTenantId());
        }
      } catch {
        /* lista opcional; login já avisa se falhar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAdminister]);

  function fecharFabricaModal() {
    setFabricaModalOpen(false);
    setFabricaSenha('');
    setFabricaErro('');
    setFabricaBackupOk(false);
    setFabricaEntendoOk(false);
    setFabricaSucesso('');
  }

  async function onDescarregarPacoteBackup() {
    setFabricaErro('');
    setFabricaBackupResumo('');
    setFabricaBackupBusy(true);
    const r = await descarregarPacoteBackupAdministrativo();
    setFabricaBackupBusy(false);
    if (!r.success || !r.data) {
      setFabricaErro(r.error ?? 'Falha ao gerar o pacote de backup.');
      return;
    }
    const actor = user?.login ?? 'desconhecido';
    const avisoTxt = r.data.avisos.length ? ` Avisos: ${r.data.avisos.join(' | ')}` : '';
    appendAuthAuditEvent({
      type: 'fabrica_backup_pacote_descarregado',
      actorLogin: actor,
      detail: `ZIP de backup: ${r.data.ficheiros} ficheiro(s) no arquivo.${avisoTxt}`,
    });
    const avisoBloco =
      r.data.avisos.length > 0
        ? ` Avisos (${r.data.avisos.length}): ${r.data.avisos.slice(0, 8).join(' — ')}${r.data.avisos.length > 8 ? ' …' : ''}`
        : '';
    setFabricaBackupResumo(
      `Gerado 1 arquivo ZIP com ${r.data.ficheiros} ficheiro(s) no interior (CSV/JSON).${avisoBloco}`,
    );
  }

  function fecharCadastroLocalModal() {
    setCadastroLocalModalOpen(false);
    setCadastroLocalFrase('');
    setCadastroLocalSenha('');
    setCadastroLocalErro('');
    setCadastroLocalBusy('');
  }

  async function onConfirmarLimpezaCadastrosLocal() {
    setCadastroLocalErro('');
    setCadastroLocalOk('');
    if (cadastroLocalFrase.trim() !== LIMPAR_CADASTROS_FRASE_LOCAL) {
      setCadastroLocalErro(`Frase invalida. Escreva: ${LIMPAR_CADASTROS_FRASE_LOCAL}`);
      return;
    }
    setCadastroLocalBusy('A validar senha...');
    const senhaOk = await verifyCurrentUserPassword(cadastroLocalSenha);
    if (!senhaOk) {
      setCadastroLocalErro('Senha incorreta.');
      setCadastroLocalBusy('');
      return;
    }
    setCadastroLocalBusy('A limpar cadastros locais...');
    const r = await executarLimpezaCadastrosLocal();
    setCadastroLocalBusy('');
    if (!r.success) {
      setCadastroLocalErro(r.error ?? 'Falha ao limpar cadastros.');
      return;
    }
    fecharCadastroLocalModal();
    setCadastroLocalOk(
      'Concluido com sucesso. Cadastros locais removidos. Configuracoes, sessao e utilizadores locais permaneceram guardados. Recarregue listas se algo parecer desactualizado.',
    );
  }

  function fecharCadastroNuvemModal() {
    setCadastroNuvemModalOpen(false);
    setCadastroNuvemFrase('');
    setCadastroNuvemSenha('');
    setCadastroNuvemErro('');
    setCadastroNuvemBusy('');
  }

  async function onConfirmarLimpezaCadastrosNuvem() {
    setCadastroNuvemErro('');
    setCadastroNuvemOk('');
    if (!user?.login) {
      setCadastroNuvemErro('Sessao sem utilizador.');
      return;
    }
    setCadastroNuvemBusy('A validar senha...');
    const senhaOk = await verifyCurrentUserPassword(cadastroNuvemSenha);
    if (!senhaOk) {
      setCadastroNuvemErro('Senha incorreta.');
      setCadastroNuvemBusy('');
      return;
    }
    setCadastroNuvemBusy('A limpar cadastros na nuvem...');
    const r = await executarPurgeCadastrosNuvem({
      login: user.login,
      senha: cadastroNuvemSenha.trim(),
      confirmFrase: cadastroNuvemFrase,
    });
    setCadastroNuvemBusy('');
    if (!r.success || !r.data) {
      setCadastroNuvemErro(r.error ?? 'Falha na limpeza na nuvem.');
      return;
    }
    appendAuthAuditEvent({
      type: 'limpeza_cadastros_nuvem_executada',
      actorLogin: user.login,
      detail: r.data.message,
    });
    fecharCadastroNuvemModal();
    setCadastroNuvemOk(`Concluido com sucesso. ${r.data.message} Cache local do snapshot invalidado.`);
  }

  async function onConfirmarLimpezaLocalFabrica() {
    setFabricaErro('');
    if (!fabricaBackupOk || !fabricaEntendoOk) {
      setFabricaErro('Marque as duas confirmacoes antes de continuar.');
      return;
    }
    setFabricaLimpezaBusy('A validar senha...');
    const senhaOk = await verifyCurrentUserPassword(fabricaSenha);
    if (!senhaOk) {
      setFabricaErro('Senha incorreta.');
      setFabricaLimpezaBusy('');
      return;
    }
    setFabricaLimpezaBusy('A limpar dados locais...');
    const r = await executarLimpezaLocalFabricaIsoPro();
    if (!r.success) {
      setFabricaErro(r.error ?? 'Falha na limpeza local.');
      setFabricaLimpezaBusy('');
      return;
    }
    setFabricaLimpezaBusy('');
    setFabricaSucesso('Limpeza concluida com sucesso. Daqui a instantes sera redireccionado para o ecra de login.');
    window.setTimeout(() => {
      window.location.assign('/login');
    }, 2600);
  }

  function fecharNuvemModal() {
    setNuvemModalOpen(false);
    setNuvemFraseOperacional('');
    setNuvemFraseUtilizadores('');
    setNuvemIncluirUtilizadores(false);
    setNuvemSenha('');
    setNuvemErro('');
    setNuvemBusy('');
    setNuvemFeitoMsg('');
  }

  async function onConfirmarPurgeNuvem() {
    setNuvemErro('');
    setNuvemSucesso('');
    if (!user?.login) {
      setNuvemErro('Sessao sem utilizador.');
      return;
    }
    setNuvemBusy('A validar senha...');
    const senhaOk = await verifyCurrentUserPassword(nuvemSenha);
    if (!senhaOk) {
      setNuvemErro('Senha incorreta.');
      setNuvemBusy('');
      return;
    }
    setNuvemBusy('A executar purge na nuvem...');
    const r = await executarPurgeNuvemIsoPro({
      login: user.login,
      senha: nuvemSenha.trim(),
      confirmFraseOperacional: nuvemFraseOperacional,
      incluirUtilizadoresEPerfis: nuvemIncluirUtilizadores,
      confirmFraseUtilizadores: nuvemFraseUtilizadores,
    });
    setNuvemBusy('');
    if (!r.success || !r.data) {
      setNuvemErro(r.error ?? 'Falha na purge na nuvem.');
      return;
    }
    const actor = user.login;
    appendAuthAuditEvent({
      type: r.data.incluirUtilizadoresEPerfis ? 'purga_nuvem_com_utilizadores_executada' : 'purga_nuvem_operacional_executada',
      actorLogin: actor,
      detail: r.data.message,
    });
    if (r.data.incluirUtilizadoresEPerfis) {
      setNuvemFeitoMsg(
        'Purge na nuvem concluida com sucesso (incluindo utilizadores e perfis). Daqui a instantes sera redireccionado para o login.',
      );
      window.setTimeout(() => {
        fecharNuvemModal();
        authLogout();
        window.location.assign('/login');
      }, 2600);
      return;
    }
    fecharNuvemModal();
    setNuvemSucesso(
      `Concluido com sucesso. ${r.data.message} O cache local do snapshot foi invalidado; recarregue listas se algo parecer desactualizado.`,
    );
  }

  if (loading || !form) {
    return <OperationalNotice>Carregando configuracoes do sistema...</OperationalNotice>;
  }

  return (
    <div className="stack-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Administracao</p>
            <h2>Configuracoes do sistema</h2>
          </div>
        </div>

        <p className="panel-copy">Central administrativa para parametros gerais, tema, numeracao e integracao da estrutura do sistema.</p>

        {error ? <div className="error-box">{error}</div> : null}
        {success ? <OperationalNotice>{success}</OperationalNotice> : null}
        <div ref={adminSucessoRef} role="status" aria-live="polite" tabIndex={-1}>
          {cadastroLocalOk || cadastroNuvemOk || nuvemSucesso ? (
            <OperationalNotice tone="success">
              {cadastroLocalOk ? <p style={{ margin: '0 0 8px' }}>{cadastroLocalOk}</p> : null}
              {cadastroNuvemOk ? <p style={{ margin: '0 0 8px' }}>{cadastroNuvemOk}</p> : null}
              {nuvemSucesso ? <p style={{ margin: 0 }}>{nuvemSucesso}</p> : null}
            </OperationalNotice>
          ) : null}
        </div>
        <OperationalNotice tone="warning">
          Area sensivel: alteracoes aqui impactam autenticacao, integracao em nuvem, numeracao operacional e blindagem do executavel.
        </OperationalNotice>

        {canAdminister ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Ambiente local</p>
                <h2>Obra ou projeto neste PC</h2>
              </div>
            </div>
            <p className="panel-copy">
              Separa cadastros e dados guardados no navegador por obra. O ambiente <strong>Principal</strong> mantém as mesmas chaves de sempre
              (compatível com dados já existentes). Ao mudar de ambiente, a aplicação recarrega. A nuvem Supabase é partilhada por todos os
              ambientes desta instalação.
            </p>
            <div className="form-columns">
              <Select
                disabled={!canAdminister}
                label="Ambiente activo"
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId === ambientesUi.ativoId) return;
                  aplicarAmbienteAtivoERecarregar(nextId);
                }}
                value={ambientesUi.ativoId}
              >
                {ambientesUi.ambientes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} ({a.id})
                  </option>
                ))}
              </Select>
              <Input
                disabled={!canAdminister}
                label="Nome da nova obra"
                onChange={(event) => setNovoAmbienteNome(event.target.value)}
                placeholder="Ex.: Obra 4358 — Norte"
                value={novoAmbienteNome}
              />
              <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, gridColumn: '1 / -1' }}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setAmbienteFormErro('');
                    const criado = adicionarAmbienteObra(novoAmbienteNome);
                    if (!criado) {
                      setAmbienteFormErro('Indique um nome para criar o ambiente.');
                      return;
                    }
                    setNovoAmbienteNome('');
                    setAmbientesUi(readEstadoAmbientes());
                  }}
                >
                  Criar ambiente
                </Button>
              </div>
              {ambienteFormErro ? (
                <div className="error-box" style={{ gridColumn: '1 / -1' }}>
                  {ambienteFormErro}
                </div>
              ) : null}
            </div>
            <ul className="panel-copy" style={{ listStyle: 'disc', marginTop: 12, paddingLeft: 20 }}>
              {ambientesUi.ambientes.map((a) => (
                <li key={a.id} style={{ marginBottom: 8 }}>
                  <strong>{a.nome}</strong>
                  {a.id !== 'padrao' ? (
                    <>
                      {' '}
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Remover "${a.nome}"? Isto apaga os dados locais só desta obra neste PC (não altera a nuvem).`,
                            )
                          ) {
                            return;
                          }
                          removerAmbienteObra(a.id);
                          setAmbientesUi(readEstadoAmbientes());
                        }}
                      >
                        Remover
                      </Button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canAdminister && hasSupabaseConfig() ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Empresa na nuvem</p>
                <h2>Organizações no mesmo Supabase</h2>
              </div>
            </div>
            <p className="panel-copy">
              Cada linha em <code>iso_pro_tenants</code> é uma empresa ou organização: dados e utilizadores ficam isolados por{' '}
              <code>tenant_id</code>. Ao aplicar outra organização, a página recarrega e a sessão é validada de novo para esse tenant.
              Criar novas empresas faz-se na base (SQL com service role) até existir fluxo na app.
            </p>
            <div className="form-columns">
              <Select
                disabled={!canAdminister || tenantsNuvemCfg.length === 0}
                label="Organização activa (tenant)"
                onChange={(event) => setTenantCfgSelect(event.target.value)}
                value={tenantCfgSelect}
              >
                {tenantsNuvemCfg.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </Select>
              <div style={{ gridColumn: '1 / -1' }}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={tenantCfgSelect === getActiveTenantId()}
                  onClick={() => aplicarTenantAtivoERecarregar(tenantCfgSelect)}
                >
                  Aplicar organização e recarregar
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Centro de custo</p>
              <h2>Dados gerais</h2>
            </div>
          </div>
          <div className="form-columns">
            <Input disabled={!canAdminister} label="Cliente" onChange={(event) => setForm((current) => (current ? { ...current, cliente: event.target.value } : current))} value={form.cliente} />
            <Input
              disabled={!canAdminister}
              label="Projeto / obra"
              onChange={(event) => setForm((current) => (current ? { ...current, projeto: event.target.value } : current))}
              placeholder='Ex.: obra 55 ou "Cliente 01 - obra 55"'
              value={form.projeto}
            />
            <Input disabled={!canAdminister} label="Contrato" onChange={(event) => setForm((current) => (current ? { ...current, contrato: event.target.value } : current))} value={form.contrato} />
            <Input disabled={!canAdminister} label="Local" onChange={(event) => setForm((current) => (current ? { ...current, local: event.target.value } : current))} value={form.local} />
          </div>
          <OperationalNotice>
            Backup Oracle (script <code>upload-backup-to-oci.ps1</code>): ao gravar estas configuracoes no desktop, o ficheiro de contexto e atualizado. No bucket, a estrutura fica{' '}
            <strong>cliente → obra</strong>: pode usar só o nome curto da obra (ex. <code>obra 55</code>) — a pasta da obra passa a{' '}
            <code>Cliente - obra 55</code>. Para outra obra do mesmo cliente, altere <strong>Projeto / obra</strong>, guarde configuracoes e volte a exportar/enviar o backup.
          </OperationalNotice>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Aparencia</p>
              <h2>Tema e padroes</h2>
            </div>
          </div>
          <p className="panel-copy" style={{ marginBottom: 12 }}>
            <strong>Tema neste utilizador:</strong> fica guardado neste navegador por login (e por ambiente de obra no PC). Não altera a
            configuração central nem credenciais — só o aspeto da interface para si. Quem não escolhe nada segue o{' '}
            <strong>tema padrão da instalação</strong> (abaixo, administradores).
          </p>
          <div className="form-columns">
            <Select
              label="Tema visível para mim"
              onChange={(event) => {
                const next = event.target.value as ConfiguracaoSistema['tema'];
                salvarUsuarioTemaPreferido(next);
                aplicarTemaEfetivoNaSessao();
                setTemaPreferenciaTick((n) => n + 1);
                setSuccess('Tema pessoal guardado neste equipamento.');
              }}
              value={temaEfetivoSessao}
            >
              <option value="neon">Neon (verde iluminado) — recomendado</option>
              <option value="padrao">Padrao escuro</option>
              <option value="escuro">Escuro</option>
              <option value="claro">Claro</option>
              <option value="verde">Verde</option>
            </Select>
            <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, gridColumn: '1 / -1' }}>
              <Button
                type="button"
                disabled={!temaPreferidoUsuario}
                variant="ghost"
                onClick={() => {
                  limparUsuarioTemaPreferido();
                  aplicarTemaEfetivoNaSessao();
                  setTemaPreferenciaTick((n) => n + 1);
                  setSuccess('Passou a usar o tema padrão da instalação.');
                }}
              >
                Usar tema da instalação (limpar escolha pessoal)
              </Button>
            </div>
            {canAdminister ? (
              <Select
                disabled={!canAdminister}
                label="Tema padrão da instalação"
                onChange={(event) => setForm((current) => (current ? { ...current, tema: event.target.value as typeof form.tema } : current))}
                value={form.tema}
              >
                <option value="neon">Neon (verde iluminado) — recomendado</option>
                <option value="padrao">Padrao escuro</option>
                <option value="escuro">Escuro</option>
                <option value="claro">Claro</option>
                <option value="verde">Verde</option>
              </Select>
            ) : (
              <div className="panel-copy" style={{ gridColumn: '1 / -1', opacity: 0.9 }}>
                Tema padrão da instalação (referência): <strong>{form.tema}</strong> — apenas perfis com permissão de administrar configurações
                podem alterar este valor ao gravar a ficha completa.
              </div>
            )}
            <Input disabled={!canAdminister} label="Sequencia atendimento" onChange={(event) => setForm((current) => (current ? { ...current, sequenciaAtendimento: Number(event.target.value || 0) } : current))} type="number" value={String(form.sequenciaAtendimento)} />
            <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', gridColumn: '1 / -1' }}>
              <input
                checked={form.mostrarAjudaModulos !== false}
                disabled={!canAdminister}
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, mostrarAjudaModulos: event.target.checked } : current))
                }
                type="checkbox"
              />
              <span>
                <strong>Mostrar textos de ajuda nos modulos</strong>
                <span style={{ display: 'block', marginTop: 6, fontSize: '0.92rem', opacity: 0.92 }}>
                  Desligar oculta blocos longos de explicacao (CSV, fluxos descritivos); avisos de fonte de dados, erros e permissoes
                  mantem-se visiveis.
                </span>
              </span>
            </label>
          </div>
          <p className="panel-copy">
            Logo institucional: aparece em recibos, impressoes de RIR, RNC, etiquetas e demais relatorios gerados em HTML. Exportacoes somente em planilha (Excel/CSV) nao incluem o logo. Padrao de fabrica: chapa I.S.O PRO (mesmo modelo da sidebar); podes substituir por imagem ou URL.
          </p>
          {logoUploadError ? <div className="error-box">{logoUploadError}</div> : null}
          <div className="form-columns">
            <Input
              accept="image/*"
              disabled={!canAdminister}
              label="Carregar imagem do logo"
              onChange={(event) => {
                setLogoUploadError('');
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                  setLogoUploadError('Selecione um arquivo de imagem (PNG, JPG, etc.).');
                  return;
                }
                if (file.size > maxLogoBytes) {
                  setLogoUploadError(`Imagem muito grande. Limite aproximado: ${Math.round(maxLogoBytes / 1024)} KB.`);
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const data = typeof reader.result === 'string' ? reader.result : '';
                  setForm((current) => (current ? { ...current, logoInstitucionalUrl: data } : current));
                };
                reader.readAsDataURL(file);
              }}
              type="file"
            />
            <Input
              disabled={!canAdminister}
              label="Ou URL / caminho (alternativa ao arquivo)"
              onChange={(event) => setForm((current) => (current ? { ...current, logoInstitucionalUrl: event.target.value } : current))}
              placeholder={`${LOGO_INSTITUCIONAL_PADRAO_FABRICA} ou https://...`}
              value={form.logoInstitucionalUrl.startsWith('data:') ? '' : form.logoInstitucionalUrl}
            />
          </div>
          {form.logoInstitucionalUrl ? (
            <div className="inline-actions" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: 8,
                  background: '#fff',
                  maxWidth: 220,
                }}
              >
                <img
                  alt="Preview do logo configurado"
                  src={
                    form.logoInstitucionalUrl.startsWith('data:')
                      ? form.logoInstitucionalUrl
                      : normalizarUrlAssetPublicParaAmbiente(form.logoInstitucionalUrl)
                  }
                  style={{ maxWidth: 200, maxHeight: 100, objectFit: 'contain', display: 'block' }}
                />
              </div>
              {canAdminister ? (
                <Button
                  onClick={() => {
                    setLogoUploadError('');
                    setForm((current) => (current ? { ...current, logoInstitucionalUrl: LOGO_INSTITUCIONAL_PADRAO_FABRICA } : current));
                  }}
                  variant="ghost"
                >
                  Restaurar logo padrao (fabrica)
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="panel-copy" style={{ marginTop: 18 }}>
            <strong>Rodape nos impressos (HTML):</strong> nome da empresa e CNPJ que aparecem em relatorio fotografico, RIR, RNC e
            recibos. O registo do titular da solucao (licenciante) embutido no codigo — ficheiro{' '}
            <code>src/lib/titularSistemaCodigo.ts</code> — nao e editavel aqui e nao sai nos relatorios.
          </p>
          <div className="form-columns">
            <Input
              disabled={!canAdminister}
              label="Nome da empresa (rodape dos relatorios)"
              onChange={(event) =>
                setForm((current) => (current ? { ...current, documentoRodapeNome: event.target.value } : current))
              }
              placeholder="Ex.: Empresa XYZ Ltda."
              value={form.documentoRodapeNome}
            />
            <Input
              disabled={!canAdminister}
              label="CNPJ da empresa (rodape dos relatorios)"
              onChange={(event) =>
                setForm((current) => (current ? { ...current, documentoRodapeCnpj: event.target.value } : current))
              }
              placeholder="Ex.: 00.000.000/0001-00"
              value={form.documentoRodapeCnpj}
            />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Qualidade</p>
              <h2>Numeracao e senhas</h2>
            </div>
          </div>
          <div className="form-columns">
            <Select
              disabled={!canAdminister}
              label="RIR — forma do número"
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, rirModoNumeracao: event.target.value as typeof form.rirModoNumeracao } : current,
                )
              }
              value={form.rirModoNumeracao}
            >
              <option value="auto">{RIR_NUMERACAO_LABELS.auto}</option>
              <option value="disciplina">{RIR_NUMERACAO_LABELS.disciplina}</option>
              <option value="manual">{RIR_NUMERACAO_LABELS.manual}</option>
            </Select>
          </div>
          <p className="panel-copy" style={{ marginTop: 4 }}>
            {descricaoModoNumeracaoRir(form.rirModoNumeracao)}
          </p>
          {form.rirModoNumeracao === 'disciplina' ? (
            <div className="rir-config-siglas-hint">
              <p className="panel-copy" style={{ marginBottom: 0 }}>
                <strong>Siglas no nº do procedimento:</strong> exemplo <code className="inline-code">PE-TUB-003</code> — a sigla fica entre os hífens. Comuns:{' '}
                <strong>TUB</strong> tubulação, <strong>ELE</strong> elétrica, <strong>MEC</strong> mecânica, <strong>INS</strong> instrumentação (outras no mesmo formato também servem).
              </p>
            </div>
          ) : null}
          <div className="form-columns" style={{ marginTop: 14 }}>
            <Input
              disabled={!canAdminister}
              label="Senha preferencial RIR"
              onChange={(event) => setForm((current) => (current ? { ...current, rirPrefSenha: event.target.value } : current))}
              type="password"
              value={form.rirPrefSenha}
            />
            <Input
              disabled={!canAdminister}
              label="Senha preferencial RNC"
              onChange={(event) => setForm((current) => (current ? { ...current, rncPrefSenha: event.target.value } : current))}
              type="password"
              value={form.rncPrefSenha}
            />
          </div>
          <p className="panel-copy" style={{ fontSize: '0.86rem', marginTop: 8 }}>
            <strong>Senha RNC:</strong> opcional — quando preenchida, exige a mesma senha ao salvar uma RNC (criar ou editar), como no I.S.O PRO. <strong>Senha RIR:</strong> mantida no perfil para compatibilidade com dados exportados do legado; nesta versão o formulário de RIR não exige essa senha.
          </p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Integracao</p>
              <h2>Supabase e nuvem</h2>
            </div>
          </div>
          <OperationalNotice>
            {hasCloudConfig
              ? `Integracao Supabase pronta. Materiais em nuvem ${cloudMaterialsEnabled ? 'ativos' : 'desativados'}.`
              : 'Integracao Supabase incompleta. O sistema segue operando localmente.'}
          </OperationalNotice>
          {hasCloudConfig && !cloudMaterialsEnabled ? (
            <OperationalNotice tone="warning">
              A integracao com Supabase esta pronta, mas os materiais seguem fora da nuvem por configuracao administrativa.
            </OperationalNotice>
          ) : null}
          {supabaseCredenciaisFixasNoDeploy ? (
            <OperationalNotice>
              URL e chave anon do Supabase estao definidas pelo servidor (build web). Os campos abaixo ficam bloqueados para
              evitar gravar credenciais em duplicado no navegador; RLS e politicas no Supabase continuam a ser a camada de
              seguranca. Para desenvolvimento com outro projecto, use variavel{' '}
              <code>VITE_SUPABASE_PREFER_SAVED_CONFIG=true</code> no build.
            </OperationalNotice>
          ) : null}
          {runtimeSupabase.url && !runtimeSupabase.key ? (
            <OperationalNotice tone="warning">A URL do Supabase foi informada, mas a chave publica ainda nao foi configurada.</OperationalNotice>
          ) : null}
          {!runtimeSupabase.url && runtimeSupabase.key ? (
            <OperationalNotice tone="warning">A chave publica foi informada, mas a URL do Supabase ainda nao foi configurada.</OperationalNotice>
          ) : null}
          <div className="form-columns">
            <Input
              disabled={!canAdminister || supabaseCredenciaisFixasNoDeploy}
              label="URL Supabase"
              onChange={(event) => setForm((current) => (current ? { ...current, supabaseUrl: event.target.value } : current))}
              value={supabaseCredenciaisFixasNoDeploy ? `(${supabaseDiag.urlHost ?? 'host definido no servidor'})` : form.supabaseUrl}
            />
            <Input
              disabled={!canAdminister || supabaseCredenciaisFixasNoDeploy}
              label="Chave anon/publicavel"
              onChange={(event) => setForm((current) => (current ? { ...current, supabaseAnonKey: event.target.value } : current))}
              type="password"
              value={supabaseCredenciaisFixasNoDeploy ? '•••••••• (definida no servidor)' : form.supabaseAnonKey}
            />
            <Input
              disabled={!canAdminister}
              label="Segredo ligacao Auth (ISO_PRO_LINK_AUTH_SECRET)"
              onChange={(event) => setForm((current) => (current ? { ...current, isoProLinkAuthSecret: event.target.value } : current))}
              type="password"
              value={form.isoProLinkAuthSecret}
            />
            <Input
              disabled={!canAdminister}
              label="Segredo criar utilizador na nuvem (ISO_PRO_ADMIN_USER_SECRET)"
              onChange={(event) => setForm((current) => (current ? { ...current, isoProAdminUserSecret: event.target.value } : current))}
              type="password"
              value={form.isoProAdminUserSecret}
            />
            <Select disabled={!canAdminister} label="Materiais em nuvem" onChange={(event) => setForm((current) => (current ? { ...current, materiaisNuvem: event.target.value === 'true' } : current))} value={String(form.materiaisNuvem)}>
              <option value="false">Desativado</option>
              <option value="true">Ativado</option>
            </Select>
          </div>
          <OperationalNotice tone="warning">
            O segredo de ligacao Auth permite chamar a Edge Function <code>iso_pro_link_auth_user</code> a partir do modulo Utilizadores (mesmo valor que{' '}
            <code>ISO_PRO_LINK_AUTH_SECRET</code> no Dashboard). Trate-o como credencial sensivel; veja{' '}
            <code>supabase/functions/README.md</code>.
          </OperationalNotice>
          <OperationalNotice tone="warning">
            Com o segredo <code>ISO_PRO_ADMIN_USER_SECRET</code> preenchido, gravar utilizadores na nuvem passa pela Edge Function{' '}
            <code>iso_pro_admin_user</code> (actor = sessao actual; e necessario voltar a entrar apos activar o segredo). Campo vazio mantem o fluxo anterior
            (insert/update directo com a chave anon).
          </OperationalNotice>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Blindagem Desktop</p>
              <h2>Instalacao autorizada</h2>
            </div>
          </div>
          <OperationalNotice>
            {desktopSecurity
              ? `Equipamento atual identificado como ${desktopSecurity.machineLabel}.`
              : 'Leitura de identidade da maquina disponivel apenas no executavel desktop.'}
          </OperationalNotice>
          {form.desktopVinculoAtivo ? (
            <OperationalNotice tone="warning">
              {`Vinculo ativo para: ${form.desktopInstalacaoAutorizadaNome || 'equipamento protegido'}.`}
            </OperationalNotice>
          ) : (
            <OperationalNotice>Nenhum vinculo de instalacao ativo no momento.</OperationalNotice>
          )}
          {form.desktopVinculoAtivo ? (
            <OperationalNotice>
              Politica de seguranca: a instalacao vinculada precisa manter validacoes periodicas recentes para continuar autorizada.
            </OperationalNotice>
          ) : null}
          {form.desktopVinculoAtivo && !form.desktopInstalacaoAutorizadaId ? (
            <OperationalNotice tone="critical">
              Blindagem inconsistente: o vinculo esta ativo, mas nenhuma maquina autorizada foi registrada ainda.
            </OperationalNotice>
          ) : null}
          {form.desktopVinculoAtivo && form.desktopInstalacaoAutorizadaId && !form.desktopInstalacaoAutorizadaNome ? (
            <OperationalNotice tone="critical">
              Blindagem inconsistente: existe uma maquina vinculada sem identificacao nominal para auditoria.
            </OperationalNotice>
          ) : null}
          {!form.desktopVinculoAtivo && desktopSecurity ? (
            <OperationalNotice>
              Para ativar a blindagem, primeiro use "Vincular esta maquina" e depois salve as configuracoes.
            </OperationalNotice>
          ) : null}
          <div className="form-columns">
            <Select
              disabled={!canAdminister}
              label="Exigir maquina autorizada"
              onChange={(event) => setForm((current) => (current ? { ...current, desktopVinculoAtivo: event.target.value === 'true' } : current))}
              value={String(form.desktopVinculoAtivo)}
            >
              <option value="false">Desativado</option>
              <option value="true">Ativado</option>
            </Select>
            <Input disabled label="Instalacao autorizada" value={form.desktopInstalacaoAutorizadaNome || '-'} />
            <Input disabled label="Ultima validacao" value={form.desktopUltimaValidacaoEm || '-'} />
          </div>
          {canAdminister ? (
            <div className="inline-actions">
              <Button disabled={!desktopSecurity} onClick={autorizarInstalacaoAtual} variant="ghost">
                Vincular esta maquina
              </Button>
              <Button onClick={desativarVinculoDesktop} variant="ghost">
                Remover vinculo
              </Button>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Licenca Desktop</p>
              <h2>Preparacao para token assinado</h2>
            </div>
          </div>
          <OperationalNotice>
            Base pronta para evoluir a blindagem local para licenca/token assinado com emissao controlada.
          </OperationalNotice>
          <OperationalNotice>
            Voce pode preencher manualmente ou importar um arquivo JSON emitido pelo gerador de licencas. Por seguranca e formato assinado, a
            licenca nao usa importacao Excel (CSV); permanece somente JSON.
          </OperationalNotice>
          {!form.desktopLicencaToken ? (
            <OperationalNotice tone="warning">Nenhum token de licenca foi registrado ainda.</OperationalNotice>
          ) : null}
          {form.desktopLicencaToken && !form.desktopLicencaEmitidaPara ? (
            <OperationalNotice tone="critical">A licenca registrada esta sem titular administrativo.</OperationalNotice>
          ) : null}
          {form.desktopLicencaToken ? (
            <OperationalNotice>
              {`Status central da licenca: ${
                desktopLicenseRegistryStatus === 'active'
                  ? 'ativa'
                  : desktopLicenseRegistryStatus === 'revoked'
                    ? 'revogada'
                    : desktopLicenseRegistryStatus === 'not_found'
                      ? 'nao registrada'
                      : 'indisponivel'
              }.`}
            </OperationalNotice>
          ) : null}
          {desktopLicenseHealth.isExpired ? (
            <OperationalNotice tone="critical">A licenca desktop atual ja esta expirada e exige renovacao imediata.</OperationalNotice>
          ) : null}
          {desktopLicenseHealth.expiresSoon ? (
            <OperationalNotice tone="warning">
              {`A licenca desktop atual expira em ${desktopLicenseHealth.daysUntilExpiration ?? 0} dia(s). Planeje a renovacao antes do bloqueio.`}
            </OperationalNotice>
          ) : null}
          <div className="form-columns">
            <Input
              disabled={!canAdminister}
              label="Token/licenca"
              onChange={(event) => setForm((current) => (current ? { ...current, desktopLicencaToken: event.target.value } : current))}
              type="password"
              value={form.desktopLicencaToken}
            />
            <Input
              disabled={!canAdminister}
              label="Emitida para"
              onChange={(event) => setForm((current) => (current ? { ...current, desktopLicencaEmitidaPara: event.target.value } : current))}
              value={form.desktopLicencaEmitidaPara}
            />
            <Input
              disabled={!canAdminister}
              label="Expira em"
              onChange={(event) => setForm((current) => (current ? { ...current, desktopLicencaExpiraEm: event.target.value } : current))}
              placeholder="2026-12-31T23:59:59.000Z"
              value={form.desktopLicencaExpiraEm}
            />
          </div>
          {canAdminister ? (
            <div className="inline-actions">
              <Input
                accept=".json"
                label="Importar arquivo de licenca"
                onChange={(event) => void importarLicencaDesktop(event.target.files?.[0] ?? null)}
                type="file"
              />
              <Button disabled={!form.desktopLicencaToken} onClick={limparLicencaDesktop} variant="ghost">
                Limpar licenca
              </Button>
              <Button disabled={!form.desktopLicencaToken} onClick={revogarLicencaDesktop} variant="danger">
                Revogar centralmente
              </Button>
              <Button disabled={!form.desktopLicencaToken} onClick={reativarLicencaDesktop} variant="ghost">
                Reativar centralmente
              </Button>
            </div>
          ) : null}
        </div>

        {canAdminister ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Administracao avancada</p>
                <h2>Limpar cadastros (manter configuracao)</h2>
              </div>
            </div>
            <OperationalNotice>
              Remove cadastros e movimento do dia a dia: <strong>materiais</strong>, <strong>fornecedores</strong>,{' '}
              <strong>colaboradores</strong>, <strong>recebimentos</strong>, <strong>planejamento</strong> (documentos),{' '}
              <strong>atendimento</strong>, <strong>RIR</strong>, <strong>RNC</strong>, inventario, equipamentos, etiquetas,
              ajustes de stock, dispositivos mobile associados, etc. — neste PC (localStorage) e, na nuvem, no snapshot e na tabela
              de materiais. <strong>Mantem</strong> URL/chave do Supabase, tema, restantes parametros em Configuracoes, sessao e
              utilizadores/perfis locais.
            </OperationalNotice>
            <OperationalNotice tone="warning">
              Na nuvem: publicar a Edge Function <code>purge_cloud_cadastros</code> (ver <code>supabase/functions/README.md</code>).
              A limpeza na nuvem afecta apenas a <strong>empresa na nuvem actualmente seleccionada</strong> (tenant), nao outras empresas no mesmo
              projecto Supabase. Nao remove contas (<code>usuarios_sistema</code>) nem <code>desktop_licencas</code>; mantem <code>configuracoesSistema</code>{' '}
              dentro do snapshot.
            </OperationalNotice>
            {cadastroLocalErro && !cadastroLocalModalOpen ? <div className="error-box">{cadastroLocalErro}</div> : null}
            {cadastroNuvemErro && !cadastroNuvemModalOpen ? <div className="error-box">{cadastroNuvemErro}</div> : null}
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <Button onClick={() => setCadastroLocalModalOpen(true)} variant="ghost">
                Limpar cadastros (este PC)...
              </Button>
              {hasCloudConfig ? (
                <Button onClick={() => setCadastroNuvemModalOpen(true)} variant="ghost">
                  Limpar cadastros (nuvem)...
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {canAdminister ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Administracao avancada</p>
                <h2>Saida de fabrica (este navegador)</h2>
              </div>
            </div>
            <OperationalNotice tone="critical">
              Esta zona remove <strong>todos</strong> os dados da aplicacao guardados neste computador no armazenamento local do
              browser (prefixo <code>iso-pro-desktop-</code>): sessao, utilizadores locais, configuracoes, cadastros e caches. Os
              dados na nuvem Supabase <strong>nao</strong> sao apagados por esta accao. Recomenda-se descarregar o pacote de backup
              antes: um unico ficheiro <code>.zip</code> com todos os CSV/JSON. Bases muito grandes usam mais memoria RAM ao gerar o
              ZIP.
            </OperationalNotice>
            <OperationalNotice tone="warning">
              Relatorios fotograficos: blobs em IndexedDB e catalogo associado sao limpos pela rotina de fabrica. Outros dados em
              IndexedDB de modulos futuros podem exigir limpeza manual no browser se existirem.
            </OperationalNotice>
            {fabricaBackupResumo ? <OperationalNotice>{fabricaBackupResumo}</OperationalNotice> : null}
            {fabricaErro ? <div className="error-box">{fabricaErro}</div> : null}
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <Button disabled={fabricaBackupBusy} onClick={() => void onDescarregarPacoteBackup()} variant="ghost">
                {fabricaBackupBusy ? 'A gerar downloads...' : 'Descarregar pacote de backup'}
              </Button>
              <Button
                onClick={() => {
                  setFabricaSucesso('');
                  setFabricaModalOpen(true);
                }}
                variant="danger"
              >
                Limpar dados locais (fabrica)...
              </Button>
            </div>
          </div>
        ) : null}

        {canAdminister && hasCloudConfig ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Administracao avancada</p>
                <h2>Purge na nuvem (Supabase)</h2>
              </div>
            </div>
            <OperationalNotice tone="critical">
              Remove dados na <strong>base Supabase</strong> apenas da <strong>empresa na nuvem actualmente seleccionada</strong> (tenant): tabela{' '}
              <code>materiais</code>, linhas em <code>dispositivos_mobile</code> e <code>desktop_licencas</code> desse tenant, e repoe o snapshot JSON em{' '}
              <code>iso_pro_snapshot</code> e <code>iso_pro_relatorio_snapshot</code> para estado vazio nesse tenant. Outras empresas no mesmo projecto
              Supabase nao sao afectadas. E <strong>irreversivel</strong> para essa empresa. E necessario publicar a Edge Function{' '}
              <code>purge_cloud_data</code> no Supabase (ver <code>supabase/functions/README.md</code>).
            </OperationalNotice>
            <OperationalNotice tone="warning">
              Opcao extrema: pode incluir apagar <strong>todos</strong> os registos em <code>usuarios_sistema</code>,{' '}
              <code>usuario_permissoes</code>, <code>perfis_acesso</code> e (se existir) <code>perfil_permissoes</code> — <strong>só do tenant
              seleccionado</strong>. Apos isso ninguem consegue autenticar na nuvem para essa empresa ate recriar perfis/utilizadores manualmente no SQL
              Editor ou por outro meio.
            </OperationalNotice>
            {nuvemErro && !nuvemModalOpen ? <div className="error-box">{nuvemErro}</div> : null}
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <Button
                onClick={() => {
                  setNuvemFeitoMsg('');
                  setNuvemModalOpen(true);
                }}
                variant="danger"
              >
                Purge na nuvem...
              </Button>
            </div>
          </div>
        ) : null}

        {canAdminister ? (
          <div className="form-actions">
            <Button onClick={submit}>Salvar configuracoes</Button>
          </div>
        ) : (
          <OperationalNotice>
            Seu perfil pode visualizar configuracoes, mas nao pode alterar parametros administrativos. Pode, no entanto, ajustar o{' '}
            <strong>tema visível para mim</strong> na secção Aparência acima — essa escolha é só sua neste navegador.
          </OperationalNotice>
        )}
      </div>

      <Modal onClose={fecharCadastroLocalModal} open={cadastroLocalModalOpen && canAdminister} title="Limpar cadastros neste PC" wide>
        <div className="editor-block">
          <p>
            Apaga chaves <code>iso-pro-desktop-*</code> de <strong>cadastro</strong> (materiais, documentos, etc.). Mantem-se
            configuracoes do sistema, sessao, utilizadores e perfis locais. Relatorios fotograficos locais tambem sao limpos.
          </p>
          <div style={{ marginTop: 14 }}>
            <Input
              autoComplete="off"
              label={`Frase (exactamente: ${LIMPAR_CADASTROS_FRASE_LOCAL})`}
              onChange={(e) => setCadastroLocalFrase(e.target.value)}
              value={cadastroLocalFrase}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Input
              autoComplete="current-password"
              label="Senha do utilizador actual"
              onChange={(e) => setCadastroLocalSenha(e.target.value)}
              type="password"
              value={cadastroLocalSenha}
            />
          </div>
          {cadastroLocalBusy ? (
            <div style={{ marginTop: 12 }}>
              <OperationalNotice>{cadastroLocalBusy}</OperationalNotice>
            </div>
          ) : null}
          {cadastroLocalErro ? (
            <div className="error-box" style={{ marginTop: 12 }}>
              {cadastroLocalErro}
            </div>
          ) : null}
          <div className="form-actions" style={{ marginTop: 18 }}>
            <Button disabled={Boolean(cadastroLocalBusy)} onClick={fecharCadastroLocalModal} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button disabled={Boolean(cadastroLocalBusy)} onClick={() => void onConfirmarLimpezaCadastrosLocal()} type="button" variant="danger">
              Limpar cadastros locais
            </Button>
          </div>
        </div>
      </Modal>

      <Modal onClose={fecharCadastroNuvemModal} open={cadastroNuvemModalOpen && canAdminister && hasCloudConfig} title="Limpar cadastros na nuvem" wide>
        <div className="editor-block">
          <p>
            Remove materiais, dispositivos mobile e listas de cadastro no <code>iso_pro_snapshot</code>, mantendo{' '}
            <code>configuracoesSistema</code>. Nao remove utilizadores nem licencas desktop na base.
          </p>
          <div style={{ marginTop: 14 }}>
            <Input
              autoComplete="off"
              label={`Frase (exactamente: ${LIMPAR_CADASTROS_FRASE_NUVEM})`}
              onChange={(e) => setCadastroNuvemFrase(e.target.value)}
              value={cadastroNuvemFrase}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Input
              autoComplete="current-password"
              label="Senha (login na base)"
              onChange={(e) => setCadastroNuvemSenha(e.target.value)}
              type="password"
              value={cadastroNuvemSenha}
            />
          </div>
          {cadastroNuvemBusy ? (
            <div style={{ marginTop: 12 }}>
              <OperationalNotice>{cadastroNuvemBusy}</OperationalNotice>
            </div>
          ) : null}
          {cadastroNuvemErro ? (
            <div className="error-box" style={{ marginTop: 12 }}>
              {cadastroNuvemErro}
            </div>
          ) : null}
          <div className="form-actions" style={{ marginTop: 18 }}>
            <Button disabled={Boolean(cadastroNuvemBusy)} onClick={fecharCadastroNuvemModal} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button disabled={Boolean(cadastroNuvemBusy)} onClick={() => void onConfirmarLimpezaCadastrosNuvem()} type="button" variant="danger">
              Limpar cadastros na nuvem
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        onClose={() => {
          if (nuvemFeitoMsg) {
            fecharNuvemModal();
            authLogout();
            window.location.assign('/login');
            return;
          }
          fecharNuvemModal();
        }}
        open={nuvemModalOpen && canAdminister && hasCloudConfig}
        title={nuvemFeitoMsg ? 'Purge na nuvem concluida' : 'Confirmar purge na nuvem'}
        wide
      >
        <div className="editor-block">
          {nuvemFeitoMsg ? (
            <>
              <OperationalNotice tone="success">
                <p style={{ margin: 0 }}>{nuvemFeitoMsg}</p>
              </OperationalNotice>
              <p className="panel-copy" style={{ marginTop: 14 }}>
                Aguarde o redireccionamento ou feche esta janela para ir ja para o login.
              </p>
            </>
          ) : (
            <>
              <p>
                Confirme com a frase exacta, a sua senha (a mesma do login na base) e, se activar a opcao extrema, a segunda frase.
                A chamada corre no servidor Supabase com privilegios administrativos.
              </p>
              <div style={{ marginTop: 14 }}>
                <Input
                  autoComplete="off"
                  label={`Frase operacional (exactamente: ${PURGE_CLOUD_FRASE_OPERACIONAL})`}
                  onChange={(e) => setNuvemFraseOperacional(e.target.value)}
                  value={nuvemFraseOperacional}
                />
              </div>
              <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
                <input
                  checked={nuvemIncluirUtilizadores}
                  onChange={(e) => {
                    setNuvemIncluirUtilizadores(e.target.checked);
                    if (!e.target.checked) setNuvemFraseUtilizadores('');
                  }}
                  type="checkbox"
                />
                <span>
                  Tambem apagar utilizadores e perfis na base (opcional; deixa de existir qualquer conta na tabela ate nova carga
                  manual).
                </span>
              </label>
              {nuvemIncluirUtilizadores ? (
                <div style={{ marginTop: 12 }}>
                  <Input
                    autoComplete="off"
                    label={`Frase para utilizadores/perfis (exactamente: ${PURGE_CLOUD_FRASE_UTILIZADORES})`}
                    onChange={(e) => setNuvemFraseUtilizadores(e.target.value)}
                    value={nuvemFraseUtilizadores}
                  />
                </div>
              ) : null}
              <div style={{ marginTop: 14 }}>
                <Input
                  autoComplete="current-password"
                  label="Senha do utilizador (validacao na base)"
                  onChange={(e) => setNuvemSenha(e.target.value)}
                  type="password"
                  value={nuvemSenha}
                />
              </div>
              {nuvemBusy ? (
                <div style={{ marginTop: 12 }}>
                  <OperationalNotice>{nuvemBusy}</OperationalNotice>
                </div>
              ) : null}
              {nuvemErro ? (
                <div className="error-box" style={{ marginTop: 12 }}>
                  {nuvemErro}
                </div>
              ) : null}
              <div className="form-actions" style={{ marginTop: 18 }}>
                <Button disabled={Boolean(nuvemBusy)} onClick={fecharNuvemModal} type="button" variant="ghost">
                  Cancelar
                </Button>
                <Button disabled={Boolean(nuvemBusy)} onClick={() => void onConfirmarPurgeNuvem()} type="button" variant="danger">
                  Executar purge na nuvem
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        onClose={() => {
          if (fabricaSucesso) {
            window.location.assign('/login');
            return;
          }
          fecharFabricaModal();
        }}
        open={fabricaModalOpen && canAdminister}
        title={fabricaSucesso ? 'Saida de fabrica concluida' : 'Confirmar saida de fabrica local'}
        wide
      >
        <div className="editor-block">
          {fabricaSucesso ? (
            <>
              <OperationalNotice tone="success">
                <p style={{ margin: 0 }}>{fabricaSucesso}</p>
              </OperationalNotice>
              <p className="panel-copy" style={{ marginTop: 14 }}>
                Aguarde o redireccionamento ou feche esta janela para ir ja para o login.
              </p>
            </>
          ) : (
            <>
              <p>
                Isto apaga a sessao actual, utilizadores e configuracoes locais, e demais chaves <code>iso-pro-desktop-*</code> neste
                browser. A seguir sera redireccionado para o ecra de login.
              </p>
              <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
                <input checked={fabricaBackupOk} onChange={(e) => setFabricaBackupOk(e.target.checked)} type="checkbox" />
                <span>Confirmo que descarreguei os backups necessarios (ou aceito o risco de perda de dados locais).</span>
              </label>
              <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10 }}>
                <input checked={fabricaEntendoOk} onChange={(e) => setFabricaEntendoOk(e.target.checked)} type="checkbox" />
                <span>Entendo que esta accao nao remove dados do Supabase e que apenas este PC / este perfil do browser e afectado.</span>
              </label>
              <div style={{ marginTop: 16 }}>
                <Input
                  autoComplete="current-password"
                  label="Senha do utilizador actual"
                  onChange={(e) => setFabricaSenha(e.target.value)}
                  type="password"
                  value={fabricaSenha}
                />
              </div>
              {fabricaLimpezaBusy ? (
                <div style={{ marginTop: 12 }}>
                  <OperationalNotice>{fabricaLimpezaBusy}</OperationalNotice>
                </div>
              ) : null}
              {fabricaErro ? (
                <div className="error-box" style={{ marginTop: 12 }}>
                  {fabricaErro}
                </div>
              ) : null}
              <div className="form-actions" style={{ marginTop: 18 }}>
                <Button disabled={Boolean(fabricaLimpezaBusy)} onClick={fecharFabricaModal} type="button" variant="ghost">
                  Cancelar
                </Button>
                <Button disabled={Boolean(fabricaLimpezaBusy)} onClick={() => void onConfirmarLimpezaLocalFabrica()} type="button" variant="danger">
                  Limpar agora
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
