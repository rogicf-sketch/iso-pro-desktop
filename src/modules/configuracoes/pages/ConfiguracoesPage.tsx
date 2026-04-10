import { useState } from 'react';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { useAuth } from '../../auth/hooks/useAuth';
import { RIR_NUMERACAO_LABELS, descricaoModoNumeracaoRir } from '../../qualidade/utils/rirNumeracaoCopy';
import { useConfiguracoes } from '../hooks/useConfiguracoes';

export function ConfiguracoesPage() {
  const { canAccessAction } = useAuth();
  const {
    form,
    loading,
    error,
    success,
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
  const [logoUploadError, setLogoUploadError] = useState('');
  const maxLogoBytes = Math.floor(1.5 * 1024 * 1024);

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
        <OperationalNotice tone="warning">
          Area sensivel: alteracoes aqui impactam autenticacao, integracao em nuvem, numeracao operacional e blindagem do executavel.
        </OperationalNotice>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Centro de custo</p>
              <h2>Dados gerais</h2>
            </div>
          </div>
          <div className="form-columns">
            <Input disabled={!canAdminister} label="Cliente" onChange={(event) => setForm((current) => (current ? { ...current, cliente: event.target.value } : current))} value={form.cliente} />
            <Input disabled={!canAdminister} label="Projeto" onChange={(event) => setForm((current) => (current ? { ...current, projeto: event.target.value } : current))} value={form.projeto} />
            <Input disabled={!canAdminister} label="Contrato" onChange={(event) => setForm((current) => (current ? { ...current, contrato: event.target.value } : current))} value={form.contrato} />
            <Input disabled={!canAdminister} label="Local" onChange={(event) => setForm((current) => (current ? { ...current, local: event.target.value } : current))} value={form.local} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Aparencia</p>
              <h2>Tema e padroes</h2>
            </div>
          </div>
          <div className="form-columns">
            <Select disabled={!canAdminister} label="Tema" onChange={(event) => setForm((current) => (current ? { ...current, tema: event.target.value as typeof form.tema } : current))} value={form.tema}>
              <option value="neon">Neon (verde iluminado) — recomendado</option>
              <option value="padrao">Padrao escuro</option>
              <option value="escuro">Escuro</option>
              <option value="claro">Claro</option>
              <option value="verde">Verde</option>
            </Select>
            <Input disabled={!canAdminister} label="Sequencia atendimento" onChange={(event) => setForm((current) => (current ? { ...current, sequenciaAtendimento: Number(event.target.value || 0) } : current))} type="number" value={String(form.sequenciaAtendimento)} />
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
                <img alt="Preview do logo configurado" src={form.logoInstitucionalUrl} style={{ maxWidth: 200, maxHeight: 100, objectFit: 'contain', display: 'block' }} />
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
          {runtimeSupabase.url && !runtimeSupabase.key ? (
            <OperationalNotice tone="warning">A URL do Supabase foi informada, mas a chave publica ainda nao foi configurada.</OperationalNotice>
          ) : null}
          {!runtimeSupabase.url && runtimeSupabase.key ? (
            <OperationalNotice tone="warning">A chave publica foi informada, mas a URL do Supabase ainda nao foi configurada.</OperationalNotice>
          ) : null}
          <div className="form-columns">
            <Input disabled={!canAdminister} label="URL Supabase" onChange={(event) => setForm((current) => (current ? { ...current, supabaseUrl: event.target.value } : current))} value={form.supabaseUrl} />
            <Input disabled={!canAdminister} label="Chave anon/publicavel" onChange={(event) => setForm((current) => (current ? { ...current, supabaseAnonKey: event.target.value } : current))} type="password" value={form.supabaseAnonKey} />
            <Select disabled={!canAdminister} label="Materiais em nuvem" onChange={(event) => setForm((current) => (current ? { ...current, materiaisNuvem: event.target.value === 'true' } : current))} value={String(form.materiaisNuvem)}>
              <option value="false">Desativado</option>
              <option value="true">Ativado</option>
            </Select>
          </div>
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
          <div className="form-actions">
            <Button onClick={submit}>Salvar configuracoes</Button>
          </div>
        ) : (
          <OperationalNotice>Seu perfil pode visualizar configuracoes, mas nao pode alterar parametros administrativos.</OperationalNotice>
        )}
      </div>
    </div>
  );
}
