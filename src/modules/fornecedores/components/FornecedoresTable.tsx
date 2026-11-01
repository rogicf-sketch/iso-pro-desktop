import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconPencil, IconRefresh } from '../../../components/ui/TableActionIcons';
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
              <div className="panel-copy">{item.cnpj || '—'}</div>
            </div>
          ),
        },
        { key: 'telefone', header: 'Telefone', render: (item) => item.telefone || '—' },
        { key: 'email', header: 'E-mail', render: (item) => item.email || '—' },
        { key: 'endereco', header: 'Endereço', render: (item) => item.endereco || '—' },
        {
          key: 'status',
          header: 'Status',
          render: (item) => <StatusBadge text={item.ativo ? 'Ativo' : 'Inativo'} tone={item.ativo ? 'ok' : 'neutral'} />,
        },
        {
          key: 'acoes',
          header: 'Ações',
          render: (item) => (
            <div className="table-actions">
              {canEdit ? (
                <TableIconButton label="Editar fornecedor" onClick={() => onEdit(item)}>
                  <IconPencil />
                </TableIconButton>
              ) : null}
              {canAdminister ? (
                <TableIconButton
                  label={item.ativo ? 'Inativar fornecedor' : 'Reativar fornecedor'}
                  onClick={() => onToggleStatus(item)}
                  tone={item.ativo ? 'danger' : 'neutral'}
                >
                  {item.ativo ? <IconBan /> : <IconRefresh />}
                </TableIconButton>
              ) : null}
            </div>
          ),
        },
      ]}
      emptyDescription="Cadastre um fornecedor ou limpe o filtro de busca."
      emptyText="Nenhum fornecedor encontrado"
      items={items}
    />
  );
}
