import { useEffect, useState, type ReactNode } from 'react';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { registrarValidacaoDesktop } from '../services/configuracoes.service';
import { getDesktopLicenseHealth, getDesktopSecurityContext, evaluateDesktopBinding } from '../services/desktopSecurity.service';
import { readConfiguracoes } from '../services/configuracoes.service';

type Props = {
  children: ReactNode;
};

export function DesktopSecurityGate({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [blockedReason, setBlockedReason] = useState('');
  const [warningMessage, setWarningMessage] = useState('');

  useEffect(() => {
    const BLOCKED_AUDIT_KEY = 'iso-pro-desktop-blocked-audit';
    const timer = window.setTimeout(() => {
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
        .catch(() => {
          setBlockedReason('');
          setLoading(false);
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

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
