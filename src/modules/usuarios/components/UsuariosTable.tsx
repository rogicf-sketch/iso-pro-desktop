import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { UsuarioSistema } from '../types/usuario.types';

type Props = {
  items: UsuarioSistema[];
  onEdit: (item: UsuarioSistema) => void;
  onToggleStatus: (item: UsuarioSistema) => void;
  canEdit: boolean;
  canAdminister: boolean;
};

export function UsuariosTable({ items, onEdit, onToggleStatus, canEdit, canAdminister }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(item.ativo ? 'normal' : 'warning')}
      columns={[
        {
          key: 'usuario',
          header: 'Usuario',
          render: (item) => (
            <div>
              <strong>{item.nome}</strong>
              <div className="panel-copy">{item.login}</div>
            </div>
          ),
        },
        {
          key: 'perfil',
          header: 'Perfil',
          render: (item) => item.perfilNome,
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => <StatusBadge text={item.ativo ? 'Ativo' : 'Inativo'} tone={item.ativo ? 'ok' : 'warning'} />,
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
                  enabledLabel={item.ativo ? 'Desativar' : 'Ativar'}
                  enabledTitle={item.ativo ? 'Desativar usuario no sistema.' : 'Reativar usuario para liberar novo acesso.'}
                  onClick={() => onToggleStatus(item)}
                  variant={item.ativo ? 'danger' : 'primary'}
                />
              ) : null}
            </div>
          ),
        },
      ]}
      emptyText="Nenhum usuario encontrado."
      items={items}
    />
  );
}
