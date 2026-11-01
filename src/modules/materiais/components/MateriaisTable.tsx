import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconPencil, IconRefresh } from '../../../components/ui/TableActionIcons';
import type { MetricasPorCodigoMaterial } from '../../documentos/services/documentoPlanejamento';
import type { MaterialListItem } from '../types/material.types';
import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import { materialEmAlertaEstoquePlanejamento } from '../services/materiaisEstoqueCritico.service';

type Props = {
  items: MaterialListItem[];
  metricasPlanejamento?: Map<string, MetricasPorCodigoMaterial>;
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
  metricasPlanejamento,
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

  function itemEmAlerta(item: MaterialListItem): boolean {
    if (!item.ativo || item.estoqueMinimo <= 0) return false;
    const prevista = metricasPlanejamento?.get(codigoMaterialKey(item.codigo))?.prevista ?? 0;
    return materialEmAlertaEstoquePlanejamento(item.saldoAtual, prevista, item.estoqueMinimo);
  }

  return (
    <DataTable
      getRowClassName={(item) =>
        getTableRowClassName(!item.ativo ? 'critical' : itemEmAlerta(item) ? 'warning' : 'normal')
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
        { key: 'codigo', header: 'Código', render: (item) => item.codigo },
        {
          key: 'codigoBarras',
          header: 'Cód. barras',
          render: (item) => (item.codigoBarras ? <span title="EAN / código de barras">{item.codigoBarras}</span> : '—'),
        },
        { key: 'descricao', header: 'Descrição', render: (item) => item.descricao },
        { key: 'disciplina', header: 'Disciplina', render: (item) => item.disciplina },
        { key: 'unidade', header: 'Unidade', render: (item) => item.unidade },
        {
          key: 'alertaPct',
          header: 'Alerta %',
          render: (item) => (item.estoqueMinimo > 0 ? `${item.estoqueMinimo}%` : '—'),
        },
        { key: 'saldo', header: 'Saldo', render: (item) => item.saldoAtual.toFixed(3).replace(/\.?0+$/, '') },
        {
          key: 'status',
          header: 'Status',
          render: (item) =>
            item.ativo ? (
              <StatusBadge text={itemEmAlerta(item) ? 'Ativo / alerta' : 'Ativo'} tone={itemEmAlerta(item) ? 'warning' : 'ok'} />
            ) : (
              <StatusBadge text="Inativo" tone="neutral" />
            ),
        },
        {
          key: 'acoes',
          header: 'Ações',
          render: (item) => (
            <div className="table-actions">
              {canEdit ? (
                <TableIconButton label="Editar material" onClick={() => onEdit(item)}>
                  <IconPencil />
                </TableIconButton>
              ) : null}
              {canAdminister ? (
                <TableIconButton
                  label={item.ativo ? 'Inativar material' : 'Reativar material'}
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
      emptyDescription="Cadastre um material ou ajuste o filtro de busca."
      emptyText="Nenhum material encontrado"
      items={items}
    />
  );
}
