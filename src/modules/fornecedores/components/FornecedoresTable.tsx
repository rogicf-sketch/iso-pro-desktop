import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Fornecedor } from '../types/fornecedor.types';

type Props = {
  items: Fornecedor[];
  onEdit: (item: Fornecedor) => void;
  onToggleStatus: (item: Fornecedor) => void;
  canEdit: boolean;
  canAdminister: boolean;
};

export function FornecedoresTable({ items, onEdit, onToggleStatus, canEdit, canAdminister }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(item.ativo ? 'normal' : 'warning')}
      columns={[
        {
          key: 'nome',
          header: 'Fornecedor',
          render: (item) => (
            <div>
              <strong>{item.nome}</strong>
              <div className="panel-copy">{item.cnpj || '-'}</div>
            </div>
          ),
        },
        { key: 'telefone', header: 'Telefone', render: (item) => item.telefone || '-' },
        { key: 'email', header: 'Email', render: (item) => item.email || '-' },
        { key: 'endereco', header: 'Endereco', render: (item) => item.endereco || '-' },
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
                  enabledTitle={item.ativo ? 'Inativar fornecedor no cadastro.' : 'Reativar fornecedor para novo uso.'}
                  onClick={() => onToggleStatus(item)}
                  variant={item.ativo ? 'danger' : 'ghost'}
                />
              ) : null}
            </div>
          ),
        },
      ]}
      emptyText="Nenhum fornecedor encontrado."
      items={items}
    />
  );
}
