import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconFolderOpen } from '../../../components/ui/TableActionIcons';
import type { ConferenciaListItem } from '../types/conferencia.types';

type Props = {
  items: ConferenciaListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

function statusLabel(status: ConferenciaListItem['status']): string {
  if (status === 'conferido') return 'Conferido';
  if (status === 'parcialmente_conferido') return 'Parcial';
  if (status === 'aguardando_conferencia') return 'Aguardando';
  if (status === 'divergente') return 'Divergente';
  return status;
}

function getTone(status: ConferenciaListItem['status']) {
  if (status === 'conferido') return 'ok';
  if (status === 'parcialmente_conferido') return 'warning';
  if (status === 'aguardando_conferencia') return 'warning';
  return 'danger';
}

export function ConferenciasTable({ items, selectedId, onSelect }: Props) {
  return (
    <DataTable
      getRowClassName={(item) =>
        getTableRowClassName(
          item.status === 'divergente'
            ? 'critical'
            : item.status === 'aguardando_conferencia' || item.status === 'parcialmente_conferido'
              ? 'warning'
              : 'normal',
        )
      }
      columns={[
        { key: 'fornecedor', header: 'Fornecedor', render: (item) => item.fornecedor },
        { key: 'nota', header: 'NF / Romaneio', render: (item) => `${item.notaFiscal || '-'} / ${item.romaneio || '-'}` },
        { key: 'conferente', header: 'Conferente', render: (item) => item.conferente || '-' },
        {
          key: 'qtd',
          header: 'Recebido / Conferido',
          render: (item) => `${item.quantidadeRecebidaTotal} / ${item.quantidadeConferidaTotal}`,
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => <StatusBadge text={statusLabel(item.status)} tone={getTone(item.status)} />,
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) => (
            <TableIconButton
              label={selectedId === item.id ? 'Selecionado' : 'Abrir'}
              onClick={() => onSelect(item.id)}
              tone={selectedId === item.id ? 'accent' : 'neutral'}
            >
              <IconFolderOpen />
            </TableIconButton>
          ),
        },
      ]}
      emptyDescription="Quando houver recebimentos aguardando, aparecem aqui para conferir."
      emptyText="Nenhum recebimento no fluxo de conferência"
      items={items}
    />
  );
}
