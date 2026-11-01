import { useMemo, useState } from 'react';
import { APP_VERSION } from '../../../appMeta';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import type { IsoProTenantListItem } from '../../../lib/isoProTenant';
import {
  downloadDesktopLicenseJson,
  issueDesktopLicenseAsSuperAdmin,
} from '../services/isoProDesktopLicense.service';

type Props = {
  tenants: IsoProTenantListItem[];
  privateKeyConfigured: boolean;
  actorLogin: string;
  actorSenha: string;
  onIssued: () => void;
};

export function DesktopLicenseIssuePanel({
  tenants,
  privateKeyConfigured,
  actorLogin,
  actorSenha,
  onIssued,
}: Props) {
  const defaultTenantId = tenants[0]?.id ?? '';
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const [issuedTo, setIssuedTo] = useState('');
  const [machineFingerprint, setMachineFingerprint] = useState('');
  const [machineLabel, setMachineLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const tenantLabel = useMemo(() => {
    const t = tenants.find((x) => x.id === tenantId);
    return t ? `${t.name} (${t.slug || t.id.slice(0, 8)})` : tenantId;
  }, [tenantId, tenants]);

  async function emitir() {
    setErro('');
    setOk('');
    if (!privateKeyConfigured) {
      setErro(
        'Configure o secret ISO_PRO_DESKTOP_LICENSE_PRIVATE_KEY no Supabase (PEM da chave privada) e faça redeploy da Edge.',
      );
      return;
    }
    if (!tenantId) {
      setErro('Escolha a empresa destino.');
      return;
    }
    if (!actorSenha) {
      setErro('Sessao sem senha em memoria — volte a entrar (Permanecer logado) para emitir licencas.');
      return;
    }

    setBusy(true);
    try {
      const result = await issueDesktopLicenseAsSuperAdmin({
        actorLogin,
        actorSenha,
        tenantId,
        issuedTo: issuedTo.trim() || tenantLabel,
        machineFingerprint: machineFingerprint.trim(),
        machineLabel: machineLabel.trim(),
        expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined,
        appVersion: appVersion.trim() || APP_VERSION,
      });
      if (!result.success || !result.data) {
        setErro(result.error ?? 'Falha ao emitir.');
        return;
      }

      downloadDesktopLicenseJson(
        `licenca-${result.data.tenant.slug || 'empresa'}-${machineLabel.trim() || 'pc'}`,
        {
          token: result.data.token,
          payload: result.data.payload,
          tenant: result.data.tenant,
        },
      );
      setOk(
        `Licenca emitida para ${result.data.tenant.name}. JSON descarregado — importe no EXE do cliente (Configuracoes > Licenca desktop).`,
      );
      setMachineFingerprint('');
      onIssued();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-block" style={{ marginTop: 16 }}>
      <p className="panel-kicker">Super-admin · Emitir licenca</p>
      <h3 style={{ marginTop: 4 }}>Nova licenca desktop</h3>
      <ModuleHelp>
        <p className="panel-copy">
          Ficas na organizacao principal e escolhes a empresa destino. O token e assinado no servidor e registado no
          tenant seleccionado.
        </p>
      </ModuleHelp>

      {!privateKeyConfigured ? (
        <OperationalNotice tone="warning">
          Falta o secret <code>ISO_PRO_DESKTOP_LICENSE_PRIVATE_KEY</code> no Dashboard Supabase (conteudo PEM da chave
          privada do <code>license:keypair</code>).
        </OperationalNotice>
      ) : null}

      <div className="form-columns">
        <Select label="Empresa destino" onChange={(e) => setTenantId(e.target.value)} value={tenantId}>
          {tenants.length === 0 ? <option value="">Nenhuma empresa</option> : null}
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slug || t.id.slice(0, 8)})
            </option>
          ))}
        </Select>
        <Input
          label="Titular (issued-to)"
          onChange={(e) => setIssuedTo(e.target.value)}
          placeholder="Ex.: Empresa ISO PRO"
          value={issuedTo}
        />
        <Input
          label="Fingerprint da maquina"
          onChange={(e) => setMachineFingerprint(e.target.value)}
          placeholder="Copiado do PC do cliente"
          value={machineFingerprint}
        />
        <Input
          label="Nome da maquina"
          onChange={(e) => setMachineLabel(e.target.value)}
          placeholder="Ex.: PC-ALMOXARIFADO"
          value={machineLabel}
        />
        <Input
          label="Validade (opcional)"
          onChange={(e) => setExpiresAt(e.target.value)}
          type="datetime-local"
          value={expiresAt}
        />
        <Input label="Versao da app" onChange={(e) => setAppVersion(e.target.value)} value={appVersion} />
      </div>

      {erro ? <div className="error-box">{erro}</div> : null}
      {ok ? <OperationalNotice tone="success">{ok}</OperationalNotice> : null}

      <div style={{ marginTop: 12 }}>
        <Button disabled={busy || !privateKeyConfigured} onClick={() => void emitir()} type="button">
          {busy ? 'A emitir…' : 'Emitir licenca'}
        </Button>
      </div>
    </div>
  );
}
