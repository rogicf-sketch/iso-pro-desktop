import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconPencil, IconRefresh } from '../../../components/ui/TableActionIcons';
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
          header: 'Usuário',
          render: (item) => (
            <div>
              <strong>{item.nome}</strong>
              <div className="panel-copy">{item.login}</div>
            </div>
          ),
        },
        {
          key: 'colaborador',
          header: 'Colaborador',
          render: (item) =>
            item.colaboradorId ? (
              <div>
                <div className="panel-copy">
                  mat. {item.colaboradorMatricula?.trim() || '—'} · {item.colaboradorFuncao?.trim() || '—'}
                </div>
              </div>
            ) : (
              <span className="panel-copy">—</span>
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
          render: (item) => <StatusBadge text={item.ativo ? 'Ativo' : 'Inativo'} tone={item.ativo ? 'ok' : 'neutral'} />,
        },
        {
          key: 'acoes',
          header: 'Ações',
          render: (item) => (
            <div className="table-actions">
              {canEdit ? (
                <TableIconButton label="Editar usuário" onClick={() => onEdit(item)}>
                  <IconPencil />
                </TableIconButton>
              ) : null}
              {canAdminister ? (
                <TableIconButton
                  label={item.ativo ? 'Desativar usuário' : 'Ativar usuário'}
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
      emptyDescription="Crie um usuário do sistema ou limpe o filtro de busca."
      emptyText="Nenhum usuário encontrado"
      items={items}
    />
  );
}
