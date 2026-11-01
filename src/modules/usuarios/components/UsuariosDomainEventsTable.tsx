import { DataTable } from '../../../components/tables/DataTable';
import type { DomainEventListItem } from '../../../lib/domainEventsRead';

type Props = {
  items: DomainEventListItem[];
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

export function UsuariosDomainEventsTable({ items, loading, error, total }: Props) {
  if (error) {
    return <div className="error-box">{error}</div>;
  }
  if (loading) {
    return <p className="panel-copy">A carregar eventos de dominio...</p>;
  }
  return (
    <>
      {typeof total === 'number' ? (
        <p className="panel-copy" style={{ marginBottom: 8 }}>
          {total} evento(s) no log de dominio (mostra os mais recentes, sem payload).
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
            key: 'tipo',
            header: 'Evento',
            render: (item) => item.event_type,
          },
          {
            key: 'entidade',
            header: 'Entidade',
            render: (item) =>
              [item.entity_type, item.entity_id].filter(Boolean).join(' · ') || '-',
          },
          {
            key: 'ator',
            header: 'Actor',
            render: (item) => item.actor_login || '-',
          },
          {
            key: 'fonte',
            header: 'Fonte',
            render: (item) => item.source || '-',
          },
        ]}
        emptyText="Nenhum evento de dominio ainda. Gravacoes SoT com auditoria (materiais, recebimentos, documentos, inventarios) passam a aparecer aqui."
        items={items}
      />
    </>
  );
}
