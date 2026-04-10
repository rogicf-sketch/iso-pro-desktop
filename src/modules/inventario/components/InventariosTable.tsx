import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { InventarioListItem } from '../types/inventario.types';

type Props = {
  items: InventarioListItem[];
  onEdit: (item: InventarioListItem) => void;
  onClose: (item: InventarioListItem) => void;
  canEdit: boolean;
  canAdminister: boolean;
};

function statusMeta(status: InventarioListItem['status']) {
  if (status === 'fechado') return createStatusMeta('Fechado', 'ok');
  if (status === 'cancelado') return createStatusMeta('Cancelado', 'danger');
  return createStatusMeta('Aberto', 'warning');
}

export function InventariosTable({ items, onEdit, onClose, canEdit, canAdminister }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(item.status === 'cancelado' ? 'critical' : item.status === 'aberto' ? 'warning' : 'normal')}
      columns={[
        {
          key: 'codigo',
          header: 'Inventario',
          render: (item) => (
            <div>
              <strong>{item.codigo}</strong>
              <div className="panel-copy">{item.descricao}</div>
            </div>
          ),
        },
        {
          key: 'responsavel',
          header: 'Responsavel',
          render: (item) => item.responsavel,
        },
        {
          key: 'data',
          header: 'Data',
          render: (item) => item.dataInventario,
        },
        {
          key: 'itens',
          header: 'Itens',
          render: (item) => item.totalItens,
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => {
            const meta = statusMeta(item.status);
            return <StatusBadge text={meta.text} tone={meta.tone} />;
          },
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) => (
            <div className="table-actions">
              {canEdit ? (
                <Button onClick={() => onEdit(item)} variant="ghost">
                  Editar
                </Button>
              ) : null}
              {canAdminister ? (
                <ActionButton
                  disabled={item.status !== 'aberto'}
                  disabledLabel={item.status === 'fechado' ? 'Fechado' : 'Travado'}
                  disabledTitle={
                    item.status === 'fechado'
                      ? 'Inventario ja fechado.'
                      : 'Inventario cancelado nao pode ser fechado.'
                  }
                  enabledLabel="Fechar"
                  enabledTitle="Fechar inventario e consolidar apuracao."
                  onClick={() => onClose(item)}
                />
              ) : null}
            </div>
          ),
        },
      ]}
      items={items}
    />
  );
}
