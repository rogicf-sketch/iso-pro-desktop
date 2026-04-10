import { useEffect, useState } from 'react';
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
import { carregarConfiguracoes, salvarConfiguracoes } from '../services/configuracoes.service';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

export function useConfiguracoes() {
  const runtimeSupabase = getRuntimeSupabaseConfig();
  const hasCloudConfig = hasSupabaseConfig();
  const cloudMaterialsEnabled = shouldUseCloudMaterials();

  const { canAccessAction, user } = useAuth();
  const [form, setForm] = useState<ConfiguracaoSistema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  async function submit() {
    setError('');
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
  }

  function autorizarInstalacaoAtual() {
    if (!desktopSecurity) {
      setError('Instalacao desktop atual nao esta disponivel para vinculacao.');
      return;
    }
    if (!window.confirm(`Confirma vincular esta instalacao ao equipamento ${desktopSecurity.machineLabel}?`)) {
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

  function desativarVinculoDesktop() {
    if (!window.confirm('Confirma remover o vinculo de instalacao desktop?')) {
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
      const parsed = JSON.parse(content) as { token?: string };
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

  function limparLicencaDesktop() {
    setError('');
    setSuccess('');

    if (!canAccessAction('configuracoes', 'administrar')) {
      setError('Seu perfil nao possui permissao para administrar configuracoes.');
      return;
    }

    if (!window.confirm('Confirma limpar a licenca desktop carregada nesta configuracao?')) {
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
    if (!window.confirm('Confirma revogar centralmente a licenca desktop atual?')) {
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
    if (!window.confirm('Confirma reativar centralmente a licenca desktop atual?')) {
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
  };
}
