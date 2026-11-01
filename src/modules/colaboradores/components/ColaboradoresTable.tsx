import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconPencil, IconRefresh } from '../../../components/ui/TableActionIcons';
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
                {item.tipo === 'interno' ? `Interno · ${item.matricula || 'Sem matrícula'}` : `Externo · ${item.empresa || 'Sem empresa'}`}
              </div>
            </div>
          ),
        },
        { key: 'funcao', header: 'Função', render: (item) => item.funcao || '—' },
        { key: 'documento', header: 'Documento', render: (item) => item.documento || '—' },
        { key: 'telefone', header: 'Telefone', render: (item) => item.telefone || '—' },
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
                <TableIconButton label="Editar colaborador" onClick={() => onEdit(item)}>
                  <IconPencil />
                </TableIconButton>
              ) : null}
              {canAdminister ? (
                <TableIconButton
                  label={item.ativo ? 'Inativar colaborador' : 'Reativar colaborador'}
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
      emptyDescription="Cadastre um colaborador ou limpe o filtro de busca."
      emptyText="Nenhum colaborador encontrado"
      items={items}
    />
  );
}
