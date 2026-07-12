import { useEffect, useState } from 'react';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialogProvider';
import { getRuntimeSupabaseConfig, hasSupabaseConfig, shouldUseCloudMaterials } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import {
  extractDesktopLicensePayload,
  getDesktopLicenseHealth,
  getDesktopLicenseRegistryStatus,
  getDesktopSecurityContext,
  updateDesktopLicenseRegistryStatus,
  type DesktopLicenseHealth,
  type DesktopLicenseRegistryStatus,
  type DesktopSecurityContext,
} from '../services/desktopSecurity.service';
import { parseDesktopLicencaImportFile } from '../schemas/desktopLicencaImportFile.zod';
import { carregarConfiguracoes, consultarReciboConfigPendenteNuvem, salvarConfiguracoes } from '../services/configuracoes.service';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

export function useConfiguracoes() {
  const { confirm } = useConfirmDialog();
  const runtimeSupabase = getRuntimeSupabaseConfig();
  const hasCloudConfig = hasSupabaseConfig();
  const cloudMaterialsEnabled = shouldUseCloudMaterials();

  const { canAccessAction, user } = useAuth();
  const [form, setForm] = useState<ConfiguracaoSistema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [info, setInfo] = useState('');
  const [reciboNuvemPendente, setReciboNuvemPendente] = useState(false);
  const [success, setSuccess] = useState('');
  const [desktopSecurity, setDesktopSecurity] = useState<DesktopSecurityContext | null>(null);
  const [desktopLicenseRegistryStatus, setDesktopLicenseRegistryStatus] = useState<DesktopLicenseRegistryStatus>('unavailable');
  const [desktopLicenseHealth, setDesktopLicenseHealth] = useState<DesktopLicenseHealth>({
    hasLicense: false,
    expiresAt: '',
    isExpired: false,
    expiresSoon: false,
    daysUntilExpiration: null,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([carregarConfiguracoes(), getDesktopSecurityContext()])
        .then(([data, securityContext]) => {
          setForm(data);
          setDesktopSecurity(securityContext);
          if (data.desktopLicencaToken) {
            setDesktopLicenseHealth(getDesktopLicenseHealth(data.desktopLicencaToken));
            void getDesktopLicenseRegistryStatus(data.desktopLicencaToken).then((result) => {
              if (result.success && result.data) {
                setDesktopLicenseRegistryStatus(result.data);
              }
            });
          }
          setLoading(false);
        })
        .catch(() => {
          setError('Nao foi possivel carregar configuracoes.');
          setLoading(false);
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasCloudConfig || !form) {
      setReciboNuvemPendente(false);
      return;
    }
    let cancelled = false;
    void consultarReciboConfigPendenteNuvem(form).then((pendente) => {
      if (!cancelled) setReciboNuvemPendente(pendente);
    });
    return () => {
      cancelled = true;
    };
  }, [hasCloudConfig, form]);

  async function submit() {
    setError('');
    setWarning('');
    setInfo('');
    setSuccess('');

    if (!canAccessAction('configuracoes', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar configuracoes.');
      return;
    }
    if (!form) {
      setError('Configuracoes indisponiveis.');
      return;
    }

    const result = await salvarConfiguracoes(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar configuracoes.');
      return;
    }

    if (form.desktopVinculoAtivo && form.desktopInstalacaoAutorizadaId) {
      appendAuthAuditEvent({
        type: 'desktop_binding_enabled',
        actorLogin: user?.login ?? 'sistema',
        targetLogin: form.desktopInstalacaoAutorizadaNome || undefined,
        detail: `Vinculo desktop ativo para ${form.desktopInstalacaoAutorizadaNome || 'instalacao protegida'}.`,
      });
    }

    setSuccess('Configuracoes salvas com sucesso.');
    if (result.warning) {
      setWarning(result.warning);
    }
    if (result.info) {
      setInfo(result.info);
    }
    if (hasCloudConfig) {
      void consultarReciboConfigPendenteNuvem(form).then(setReciboNuvemPendente);
    }
  }

  async function autorizarInstalacaoAtual() {
    if (!desktopSecurity) {
      setError('Instalacao desktop atual nao esta disponivel para vinculacao.');
      return;
    }
    if (!(await confirm({ message: `Confirma vincular esta instalacao ao equipamento ${desktopSecurity.machineLabel}?` }))) {
      return;
    }

    setForm((current) =>
      current
        ? {
            ...current,
            desktopVinculoAtivo: true,
            desktopInstalacaoAutorizadaId: desktopSecurity.machineFingerprint,
            desktopInstalacaoAutorizadaNome: desktopSecurity.machineLabel,
            desktopUltimaValidacaoEm: new Date().toISOString(),
          }
        : current,
    );
    appendAuthAuditEvent({
      type: 'desktop_binding_enabled',
      actorLogin: user?.login ?? 'sistema',
      targetLogin: desktopSecurity.machineLabel,
      detail: `Instalacao atual marcada para vinculacao (${desktopSecurity.machineLabel}).`,
    });
    setSuccess('Instalacao atual preparada para vinculacao. Salve as configuracoes para aplicar a blindagem.');
  }

  async function desativarVinculoDesktop() {
    if (!(await confirm({ message: 'Confirma remover o vinculo de instalacao desktop?' }))) {
      return;
    }
    setForm((current) =>
      current
        ? {
            ...current,
            desktopVinculoAtivo: false,
            desktopInstalacaoAutorizadaId: '',
            desktopInstalacaoAutorizadaNome: '',
            desktopUltimaValidacaoEm: '',
          }
        : current,
    );
    appendAuthAuditEvent({
      type: 'desktop_binding_removed',
      actorLogin: user?.login ?? 'sistema',
      detail: 'Vinculo de instalacao desktop removido da configuracao.',
    });
    setSuccess('Vinculo de instalacao removido. Salve as configuracoes para confirmar.');
  }

  async function importarLicencaDesktop(file: File | null) {
    setError('');
    setSuccess('');

    if (!canAccessAction('configuracoes', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar configuracoes.');
      return;
    }

    if (!file) {
      setError('Selecione um arquivo de licenca para importar.');
      return;
    }

    try {
      const content = await file.text();
      let jsonParsed: unknown;
      try {
        jsonParsed = JSON.parse(content);
      } catch {
        setError('O arquivo informado nao e um JSON valido.');
        return;
      }
      const parsed = parseDesktopLicencaImportFile(jsonParsed);
      if (!parsed) {
        setError('O arquivo informado nao contem um objeto JSON valido para licenca.');
        return;
      }
      const token = parsed.token?.trim();

      if (!token) {
        setError('O arquivo informado nao contem um token de licenca valido.');
        return;
      }

      const payload = extractDesktopLicensePayload(token);
      if (!payload) {
        setError('Nao foi possivel interpretar o payload da licenca importada.');
        return;
      }

      setForm((current) =>
        current
          ? {
              ...current,
              desktopLicencaToken: token,
              desktopLicencaEmitidaPara: payload.issuedTo,
              desktopLicencaExpiraEm: payload.expiresAt ?? '',
            }
          : current,
      );
      setDesktopLicenseRegistryStatus('unavailable');
      setDesktopLicenseHealth(getDesktopLicenseHealth(token));
      setSuccess('Licenca desktop importada. Revise os dados e salve as configuracoes para aplicar.');
    } catch {
      setError('Nao foi possivel ler o arquivo da licenca desktop.');
    }
  }

  async function limparLicencaDesktop() {
    setError('');
    setSuccess('');

    if (!canAccessAction('configuracoes', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar configuracoes.');
      return;
    }

    if (!(await confirm({ message: 'Confirma limpar a licenca desktop carregada nesta configuracao?' }))) {
      return;
    }

    setForm((current) =>
      current
        ? {
            ...current,
            desktopLicencaToken: '',
            desktopLicencaEmitidaPara: '',
            desktopLicencaExpiraEm: '',
          }
        : current,
    );
    setDesktopLicenseRegistryStatus('unavailable');
    setDesktopLicenseHealth({
      hasLicense: false,
      expiresAt: '',
      isExpired: false,
      expiresSoon: false,
      daysUntilExpiration: null,
    });
    setSuccess('Licenca desktop removida da configuracao atual. Salve para confirmar.');
  }

  async function revogarLicencaDesktop() {
    setError('');
    setSuccess('');

    if (!canAccessAction('configuracoes', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar configuracoes.');
      return;
    }
    if (!form?.desktopLicencaToken) {
      setError('Nenhuma licenca desktop carregada para revogar.');
      return;
    }
    if (!(await confirm({ message: 'Confirma revogar centralmente a licenca desktop atual?', danger: true }))) {
      return;
    }

    const result = await updateDesktopLicenseRegistryStatus(form.desktopLicencaToken, 'revoked');
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel revogar a licenca desktop.');
      return;
    }

    setDesktopLicenseRegistryStatus('revoked');
    appendAuthAuditEvent({
      type: 'desktop_license_revoked',
      actorLogin: user?.login ?? 'sistema',
      targetLogin: form.desktopLicencaEmitidaPara || undefined,
      detail: 'Licenca desktop revogada centralmente pela administracao.',
    });
    setSuccess('Licenca desktop revogada centralmente com sucesso.');
  }

  async function reativarLicencaDesktop() {
    setError('');
    setSuccess('');

    if (!canAccessAction('configuracoes', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar configuracoes.');
      return;
    }
    if (!form?.desktopLicencaToken) {
      setError('Nenhuma licenca desktop carregada para reativar.');
      return;
    }
    if (!(await confirm({ message: 'Confirma reativar centralmente a licenca desktop atual?' }))) {
      return;
    }

    const result = await updateDesktopLicenseRegistryStatus(form.desktopLicencaToken, 'active');
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel reativar a licenca desktop.');
      return;
    }

    setDesktopLicenseRegistryStatus('active');
    appendAuthAuditEvent({
      type: 'desktop_license_restored',
      actorLogin: user?.login ?? 'sistema',
      targetLogin: form.desktopLicencaEmitidaPara || undefined,
      detail: 'Licenca desktop reativada centralmente pela administracao.',
    });
    setSuccess('Licenca desktop reativada centralmente com sucesso.');
  }

  return {
    form,
    loading,
    error,
    warning,
    info,
    reciboNuvemPendente,
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
  };
}
