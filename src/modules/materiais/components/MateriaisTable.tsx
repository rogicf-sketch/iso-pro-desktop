import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { MaterialListItem } from '../types/material.types';

type Props = {
  items: MaterialListItem[];
  onEdit: (item: MaterialListItem) => void;
  onToggleStatus: (item: MaterialListItem) => void;
  canEdit: boolean;
  canAdminister: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectPagina?: () => void;
};

export function MateriaisTable({
  items,
  onEdit,
  onToggleStatus,
  canEdit,
  canAdminister,
  selectedIds,
  onToggleSelect,
  onToggleSelectPagina,
}: Props) {
  const selecaoExclusaoAtiva = Boolean(canAdminister && selectedIds && onToggleSelect && onToggleSelectPagina);
  const allPageSelected = selecaoExclusaoAtiva && items.length > 0 && items.every((i) => selectedIds!.has(i.id));
  const somePageSelected = selecaoExclusaoAtiva && items.some((i) => selectedIds!.has(i.id));
  const headerCbRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  return (
    <DataTable
      getRowClassName={(item) =>
        getTableRowClassName(!item.ativo ? 'critical' : item.saldoAtual <= item.estoqueMinimo ? 'warning' : 'normal')
      }
      getRowKey={(item) => item.id}
      columns={[
        ...(selecaoExclusaoAtiva
          ? [
              {
                key: 'selecionar',
                header: (
                  <input
                    aria-label="Selecionar todos desta pagina"
                    checked={allPageSelected}
                    onChange={onToggleSelectPagina}
                    ref={headerCbRef}
                    type="checkbox"
                  />
                ),
                render: (item: MaterialListItem) => (
                  <input
                    aria-label={`Selecionar material ${item.codigo}`}
                    checked={selectedIds!.has(item.id)}
                    onChange={() => onToggleSelect!(item.id)}
                    type="checkbox"
                  />
                ),
              },
            ]
          : []),
        { key: 'codigo', header: 'Codigo', render: (item) => item.codigo },
        {
          key: 'codigoBarras',
          header: 'Cod. barras',
          render: (item) => (item.codigoBarras ? <span title="EAN / codigo de barras">{item.codigoBarras}</span> : '—'),
        },
        { key: 'descricao', header: 'Descricao', render: (item) => item.descricao },
        { key: 'disciplina', header: 'Disciplina', render: (item) => item.disciplina },
        { key: 'unidade', header: 'Unidade', render: (item) => item.unidade },
        { key: 'saldo', header: 'Saldo', render: (item) => item.saldoAtual.toFixed(3).replace(/\.?0+$/, '') },
        {
          key: 'status',
          header: 'Status',
          render: (item) =>
            item.ativo ? (
              <StatusBadge text={item.saldoAtual <= item.estoqueMinimo ? 'Ativo / alerta' : 'Ativo'} tone={item.saldoAtual <= item.estoqueMinimo ? 'warning' : 'ok'} />
            ) : (
              <StatusBadge text="Inativo" tone="neutral" />
            ),
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
                  enabledTitle={item.ativo ? 'Inativar material para impedir novo uso operacional.' : 'Reativar material para voltar ao fluxo.'}
                  onClick={() => onToggleStatus(item)}
                  variant={item.ativo ? 'danger' : 'ghost'}
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
