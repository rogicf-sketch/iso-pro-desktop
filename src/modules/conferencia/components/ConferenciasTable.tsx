import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { ConferenciaListItem } from '../types/conferencia.types';

type Props = {
  items: ConferenciaListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
};

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
          render: (item) => <StatusBadge text={item.status} tone={getTone(item.status)} />,
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) => (
            <Button onClick={() => onSelect(item.id)} variant={selectedId === item.id ? 'primary' : 'ghost'}>
              {selectedId === item.id ? 'Selecionado' : 'Abrir'}
            </Button>
          ),
        },
      ]}
      emptyText="Nenhum recebimento no fluxo de conferencia."
      items={items}
    />
  );
}
