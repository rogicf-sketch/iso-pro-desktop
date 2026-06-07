import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Button } from '../../../components/ui/Button';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { registrarValidacaoDesktop } from '../services/configuracoes.service';
import { getDesktopLicenseHealth, getDesktopSecurityContext, evaluateDesktopBinding } from '../services/desktopSecurity.service';
import { readConfiguracoes } from '../services/configuracoes.service';

type Props = {
  children: ReactNode;
};

const VALIDATION_ERROR_MESSAGE =
  'Nao foi possivel concluir a validacao de seguranca desta instalacao desktop. Verifique a ligacao ao sistema e tente novamente.';

function shouldFailClosedOnValidationError(): boolean {
  const config = readConfiguracoes();
  const isDesktopRuntime = window.isoProDesktop?.platform === 'desktop';
  return Boolean(isDesktopRuntime && config.desktopVinculoAtivo);
}

export function DesktopSecurityGate({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [blockedReason, setBlockedReason] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const [validationAttempt, setValidationAttempt] = useState(0);

  const runValidation = useCallback(() => {
    const BLOCKED_AUDIT_KEY = 'iso-pro-desktop-blocked-audit';
    setLoading(true);
    setBlockedReason('');

    void getDesktopSecurityContext()
      .then(async (context) => {
        const binding = await evaluateDesktopBinding(context);
        const licenseHealth = getDesktopLicenseHealth(readConfiguracoes().desktopLicencaToken);
        if (binding.blocked) {
          const auditSignature = `${context?.machineFingerprint ?? 'desconhecida'}|${binding.reason}`;
          if (sessionStorage.getItem(BLOCKED_AUDIT_KEY) !== auditSignature) {
            appendAuthAuditEvent({
              type: 'desktop_binding_blocked',
              actorLogin: 'instalacao_desktop',
              targetLogin: context?.machineLabel,
              detail: binding.reason,
            });
            sessionStorage.setItem(BLOCKED_AUDIT_KEY, auditSignature);
          }
        } else if (context?.isElectron) {
          registrarValidacaoDesktop();
        }
        setWarningMessage(
          !binding.blocked && licenseHealth.expiresSoon
            ? `A licenca desktop desta instalacao expira em ${licenseHealth.daysUntilExpiration ?? 0} dia(s). Planeje a renovacao.`
            : '',
        );
        setBlockedReason(binding.blocked ? binding.reason : '');
        setLoading(false);
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        if (shouldFailClosedOnValidationError()) {
          appendAuthAuditEvent({
            type: 'desktop_binding_blocked',
            actorLogin: 'instalacao_desktop',
            targetLogin: 'validacao_falhou',
            detail: `Falha na validacao de seguranca: ${detail}`,
          });
          setBlockedReason(VALIDATION_ERROR_MESSAGE);
        } else {
          console.warn('[I.S.O PRO] Validacao desktop ignorada (web ou vinculo inativo):', detail);
          setBlockedReason('');
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(runValidation, 0);
    return () => window.clearTimeout(timer);
  }, [runValidation, validationAttempt]);

  if (loading) {
    return <OperationalNotice>Validando seguranca da instalacao desktop...</OperationalNotice>;
  }

  if (blockedReason) {
    return (
      <div className="stack-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Seguranca Desktop</p>
              <h2>Instalacao bloqueada</h2>
            </div>
          </div>

          <p className="panel-copy">
            Esta copia do sistema nao esta autorizada para operar neste equipamento.
          </p>

          <OperationalNotice tone="critical">{blockedReason}</OperationalNotice>
          {blockedReason === VALIDATION_ERROR_MESSAGE ? (
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setValidationAttempt((n) => n + 1)}>
                Tentar novamente
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (warningMessage) {
    return (
      <>
        <OperationalNotice tone="warning">{warningMessage}</OperationalNotice>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
