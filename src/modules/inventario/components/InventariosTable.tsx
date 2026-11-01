import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconCheck, IconDownload, IconPencil } from '../../../components/ui/TableActionIcons';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { InventarioListItem } from '../types/inventario.types';

type Props = {
  items: InventarioListItem[];
  onEdit: (item: InventarioListItem) => void;
  onClose: (item: InventarioListItem) => void;
  onExportCsv?: (item: InventarioListItem) => void;
  canEdit: boolean;
  canAdminister: boolean;
  canExportCsv: boolean;
};

function statusMeta(status: InventarioListItem['status']) {
  if (status === 'fechado') return createStatusMeta('Fechado', 'ok');
  if (status === 'cancelado') return createStatusMeta('Cancelado', 'danger');
  return createStatusMeta('Aberto', 'warning');
}

export function InventariosTable({
  items,
  onEdit,
  onClose,
  onExportCsv,
  canEdit,
  canAdminister,
  canExportCsv,
}: Props) {
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
          key: 'mobile',
          header: 'Mobile',
          render: (item) => (item.contagemMobileHabilitada ? 'Sim' : 'Nao'),
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
          header: 'Ações',
          render: (item) => (
            <div className="table-actions">
              {canEdit ? (
                <TableIconButton label="Editar" onClick={() => onEdit(item)}>
                  <IconPencil />
                </TableIconButton>
              ) : null}
              {canAdminister ? (
                <TableIconButton
                  disabled={item.status !== 'aberto'}
                  label={
                    item.status === 'fechado'
                      ? 'Inventario ja fechado.'
                      : item.status === 'cancelado'
                        ? 'Inventario cancelado nao pode ser fechado.'
                        : 'Fechar inventario e consolidar apuracao.'
                  }
                  onClick={() => onClose(item)}
                >
                  <IconCheck />
                </TableIconButton>
              ) : null}
              {canExportCsv && onExportCsv ? (
                <TableIconButton
                  disabled={item.status !== 'fechado'}
                  label={
                    item.status === 'fechado'
                      ? 'Exporta linhas do inventario (CSV compativel com Excel).'
                      : item.status === 'cancelado'
                        ? 'Inventarios cancelados nao podem ser exportados.'
                        : 'Feche o inventario para habilitar a exportacao (CSV compativel com Excel).'
                  }
                  onClick={() => onExportCsv(item)}
                >
                  <IconDownload />
                </TableIconButton>
              ) : null}
            </div>
          ),
        },
      ]}
      emptyDescription="Abra um inventário ou ajuste o filtro de busca/status."
      emptyText="Nenhum inventário encontrado"
      items={items}
    />
  );
}
