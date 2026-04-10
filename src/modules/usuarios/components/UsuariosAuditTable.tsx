import { DataTable } from '../../../components/tables/DataTable';
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
          render: (item) => item.type,
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
