import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconEye, IconPencil, IconPrinter } from '../../../components/ui/TableActionIcons';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { RncRegistro } from '../types/qualidade.types';

type Props = {
  items: RncRegistro[];
  onEdit: (item: RncRegistro) => void;
  onPrint: (item: RncRegistro) => void;
  onVisualizar: (item: RncRegistro) => void;
  canEdit: boolean;
};

function tone(status: RncRegistro['status']) {
  if (status === 'concluido') return createStatusMeta(status, 'ok');
  if (status === 'cancelado') return createStatusMeta(status, 'neutral');
  if (status === 'em_tratativa') return createStatusMeta(status, 'warning');
  return createStatusMeta(status, 'danger');
}

export function RncTable({ items, onEdit, onPrint, onVisualizar, canEdit }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(item.status === 'aberto' ? 'critical' : item.status === 'em_tratativa' ? 'warning' : 'normal')}
      columns={[
        { key: 'codigo', header: 'Código', render: (item) => item.codigo },
        { key: 'nf', header: 'NF', render: (item) => item.recebimentoNotaFiscal ?? '—' },
        { key: 'setor', header: 'Setor', render: (item) => item.setor },
        { key: 'responsavel', header: 'Responsável', render: (item) => item.responsavel },
        { key: 'data', header: 'Data', render: (item) => item.dataRegistro },
        {
          key: 'status',
          header: 'Status',
          render: (item) => {
            const meta = tone(item.status);
            return <StatusBadge text={meta.text} tone={meta.tone} />;
          },
        },
        {
          key: 'acoes',
          header: 'Ações',
          render: (item) => (
            <div className="table-actions">
              <TableIconButton label="Pre-visualizar relatorio RNC (impressao / PDF)" onClick={() => onVisualizar(item)}>
                <IconEye />
              </TableIconButton>
              <TableIconButton label="Imprimir RNC" onClick={() => onPrint(item)}>
                <IconPrinter />
              </TableIconButton>
              {canEdit ? (
                <TableIconButton
                  disabled={item.status === 'concluido' || item.status === 'cancelado'}
                  label={
                    item.status === 'cancelado'
                      ? 'RNC cancelada nao pode ser editada por este fluxo.'
                      : item.status === 'concluido'
                        ? 'RNC concluida nao pode ser editada por este fluxo.'
                        : 'Editar RNC'
                  }
                  onClick={() => onEdit(item)}
                >
                  <IconPencil />
                </TableIconButton>
              ) : null}
            </div>
          ),
        },
      ]}
      emptyDescription="Registe uma RNC ou ajuste o filtro de busca/status."
      emptyText="Nenhuma RNC encontrada"
      items={items}
    />
  );
}
