import { DataTable } from '../../../components/tables/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { authAuditLabel, authAuditTone } from '../../auth/services/authAuditLabels';
import type { AuthAuditEvent } from '../../auth/services/authAudit.service';

type Props = {
  items: AuthAuditEvent[];
};

export function UsuariosAuditTable({ items }: Props) {
  return (
    <DataTable
      columns={[
        {
          key: 'quando',
          header: 'Quando',
          render: (item) => new Date(item.createdAt).toLocaleString('pt-BR'),
        },
        {
          key: 'evento',
          header: 'Evento',
          render: (item) => (
            <span title={item.type}>
              <StatusBadge text={authAuditLabel(item.type)} tone={authAuditTone(item.type)} />
            </span>
          ),
        },
        {
          key: 'ator',
          header: 'Ator',
          render: (item) => item.actorLogin,
        },
        {
          key: 'alvo',
          header: 'Alvo',
          render: (item) => item.targetLogin ?? '-',
        },
        {
          key: 'detalhe',
          header: 'Detalhe',
          render: (item) => item.detail,
        },
      ]}
      emptyText="Nenhum evento critico registrado."
      items={items}
    />
  );
}
