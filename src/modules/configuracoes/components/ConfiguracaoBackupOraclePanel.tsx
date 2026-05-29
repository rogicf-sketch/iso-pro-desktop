import { useCallback, useEffect, useState } from 'react';
import {
  executarBackupOracleAgora,
  obterEstadoBackupOracle,
} from '../../../lib/backupOracleAuto.client';
import { Button } from '../../../components/ui/Button';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

type Props = {
  form: ConfiguracaoSistema;
  canAdminister: boolean;
  onChange: (next: ConfiguracaoSistema) => void;
};

function formatarData(iso: string | null): string {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

export function ConfiguracaoBackupOraclePanel({ form, canAdminister, onChange }: Props) {
  const [estado, setEstado] = useState<Awaited<ReturnType<typeof obterEstadoBackupOracle>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const recarregar = useCallback(async () => {
    const r = await obterEstadoBackupOracle();
    setEstado(r);
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const executarAgora = async () => {
    setBusy(true);
    setMsg('');
    const r = await executarBackupOracleAgora();
    setBusy(false);
    if (r.ok) {
      setMsg(r.detail);
    } else {
      setMsg(r.error);
    }
    void recarregar();
  };

  const ultimo =
    estado && 'ok' in estado && estado.ok
      ? {
          em: estado.ultimoBackupEm,
          ok: estado.ultimoBackupOk,
          erro: estado.ultimoErro,
          atividade: estado.atividade,
        }
      : null;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Reserva na Oracle</p>
          <h2>Backup automatico inteligente</h2>
        </div>
      </div>
      <p className="panel-copy">
        Envia uma copia do snapshot Supabase para o bucket <strong>iso-pro-backups</strong> no Object Storage Oracle.
        Rotina: cerca de <strong>1 vez por semana</strong>. Com muito movimento (atendimentos, recebimentos, cadastros),
        pode disparar a cada <strong>3 dias</strong>. Requer OCI CLI configurado no PC (<code>~/.oci/config</code>).
      </p>

      <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <input
          checked={form.backupOracleAutomaticoHabilitado === true}
          disabled={!canAdminister}
          onChange={(event) =>
            onChange({ ...form, backupOracleAutomaticoHabilitado: event.target.checked })
          }
          type="checkbox"
        />
        <span>
          <strong>Activar backup automatico na Oracle</strong> (so app desktop)
        </span>
      </label>

      {ultimo ? (
        <OperationalNotice>
          Ultimo backup: {formatarData(ultimo.em)}
          {ultimo.ok ? ' (OK)' : ' (falhou)'}
          {ultimo.erro ? ` — ${ultimo.erro}` : ''}
          <br />
          Movimento desde o ultimo backup: {ultimo.atividade.atendimentos} atendimentos,{' '}
          {ultimo.atividade.recebimentos} recebimentos, {ultimo.atividade.cadastros} cadastros.
        </OperationalNotice>
      ) : null}

      {msg ? <OperationalNotice>{msg}</OperationalNotice> : null}

      <div style={{ marginTop: '0.75rem' }}>
        <Button disabled={busy || !canAdminister} onClick={() => void executarAgora()} type="button" variant="ghost">
          {busy ? 'A enviar backup...' : 'Fazer backup Oracle agora'}
        </Button>
      </div>
    </div>
  );
}
