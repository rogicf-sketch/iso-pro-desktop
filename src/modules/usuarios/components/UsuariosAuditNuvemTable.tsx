import { DataTable } from '../../../components/tables/DataTable';
import type { OperationalAuditRow } from '../../../lib/operationalAudit';

type Props = {
  items: OperationalAuditRow[];
  loading?: boolean;
  error?: string;
  total?: number;
};

function fmtWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export function UsuariosAuditNuvemTable({ items, loading, error, total }: Props) {
  if (error) {
    return <div className="error-box">{error}</div>;
  }
  if (loading) {
    return <p className="panel-copy">A carregar auditoria da nuvem...</p>;
  }
  return (
    <>
      {typeof total === 'number' ? (
        <p className="panel-copy" style={{ marginBottom: 8 }}>
          {total} evento(s) na nuvem (mostra os mais recentes).
        </p>
      ) : null}
      <DataTable
        columns={[
          {
            key: 'quando',
            header: 'Quando',
            render: (item) => fmtWhen(item.created_at),
          },
          {
            key: 'ator',
            header: 'Utilizador',
            render: (item) => item.actor_login,
          },
          {
            key: 'acao',
            header: 'Acao',
            render: (item) => item.action,
          },
          {
            key: 'ip',
            header: 'IP',
            render: (item) => item.client_ip || '-',
          },
          {
            key: 'dispositivo',
            header: 'Dispositivo',
            render: (item) => item.device_label || item.client_kind || '-',
          },
          {
            key: 'detalhe',
            header: 'Detalhe',
            render: (item) => item.detail || '-',
          },
        ]}
        emptyText="Nenhum evento na auditoria da nuvem ainda. Exclusoes, conferencias e atendimentos passam a aparecer aqui."
        items={items}
      />
    </>
  );
}
