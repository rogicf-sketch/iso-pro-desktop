import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Colaborador } from '../types/colaborador.types';

type Props = {
  items: Colaborador[];
  canEdit: boolean;
  canAdminister: boolean;
  onEdit: (item: Colaborador) => void;
  onToggleStatus: (item: Colaborador) => void;
};

export function ColaboradoresTable({ items, canEdit, canAdminister, onEdit, onToggleStatus }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(item.ativo ? 'normal' : 'warning')}
      columns={[
        {
          key: 'nome',
          header: 'Colaborador',
          render: (item) => (
            <div>
              <strong>{item.nome}</strong>
              <div className="panel-copy">
                {item.tipo === 'interno' ? `Interno • ${item.matricula || 'Sem matricula'}` : `Externo • ${item.empresa || 'Sem empresa'}`}
              </div>
            </div>
          ),
        },
        { key: 'funcao', header: 'Funcao', render: (item) => item.funcao || '-' },
        { key: 'documento', header: 'Documento', render: (item) => item.documento || '-' },
        { key: 'telefone', header: 'Telefone', render: (item) => item.telefone || '-' },
        {
          key: 'status',
          header: 'Status',
          render: (item) => <StatusBadge text={item.ativo ? 'Ativo' : 'Inativo'} tone={item.ativo ? 'ok' : 'neutral'} />,
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
                  enabledLabel={item.ativo ? 'Inativar' : 'Reativar'}
                  enabledTitle={item.ativo ? 'Inativar colaborador para impedir selecao operacional.' : 'Reativar colaborador no sistema.'}
                  onClick={() => onToggleStatus(item)}
                  variant={item.ativo ? 'danger' : 'ghost'}
                />
              ) : null}
            </div>
          ),
        },
      ]}
      emptyText="Nenhum colaborador encontrado."
      items={items}
    />
  );
}
