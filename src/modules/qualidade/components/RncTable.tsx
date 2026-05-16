import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
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
        { key: 'codigo', header: 'Codigo', render: (item) => item.codigo },
        { key: 'nf', header: 'NF', render: (item) => item.recebimentoNotaFiscal ?? '—' },
        { key: 'setor', header: 'Setor', render: (item) => item.setor },
        { key: 'responsavel', header: 'Responsavel', render: (item) => item.responsavel },
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
          header: 'Acoes',
          render: (item) => (
            <div className="table-actions">
              <ActionButton
                enabledLabel="Visualizar"
                enabledTitle="Pre-visualizar relatorio RNC (impressao / PDF)"
                onClick={() => onVisualizar(item)}
                variant="ghost"
              />
              <ActionButton enabledLabel="Imprimir" enabledTitle="Imprimir RNC" onClick={() => onPrint(item)} variant="ghost" />
              {canEdit ? (
                <ActionButton
                  disabled={item.status === 'concluido' || item.status === 'cancelado'}
                  disabledLabel={item.status === 'cancelado' ? 'Cancelado' : 'Travado'}
                  disabledTitle={
                    item.status === 'cancelado'
                      ? 'RNC cancelada nao pode ser editada por este fluxo.'
                      : 'RNC concluida nao pode ser editada por este fluxo.'
                  }
                  enabledLabel="Editar"
                  enabledTitle="Editar RNC"
                  onClick={() => onEdit(item)}
                  variant="ghost"
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
