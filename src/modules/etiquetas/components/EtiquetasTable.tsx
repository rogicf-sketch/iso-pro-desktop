import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconCheck, IconPencil } from '../../../components/ui/TableActionIcons';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { Etiqueta, EtiquetaListItem } from '../types/etiqueta.types';

type Props = {
  items: EtiquetaListItem[];
  canEdit: boolean;
  canAdminister: boolean;
  onEdit: (item: EtiquetaListItem) => void;
  onStatus: (item: EtiquetaListItem, status: Etiqueta['status']) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectPagina?: () => void;
};

function getTone(status: Etiqueta['status']) {
  if (status === 'impressa') return createStatusMeta(status, 'ok');
  if (status === 'pronta') return createStatusMeta(status, 'warning');
  if (status === 'rascunho') return createStatusMeta(status, 'neutral');
  return createStatusMeta(status, 'danger');
}

export function EtiquetasTable({
  items,
  canEdit,
  canAdminister,
  onEdit,
  onStatus,
  selectedIds,
  onToggleSelect,
  onToggleSelectPagina,
}: Props) {
  const selecaoAtiva = Boolean(canAdminister && selectedIds && onToggleSelect && onToggleSelectPagina);
  const allPageSelected = selecaoAtiva && items.length > 0 && items.every((i) => selectedIds!.has(i.id));
  const somePageSelected = selecaoAtiva && items.some((i) => selectedIds!.has(i.id));
  const headerCbRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  const columns = [
    ...(selecaoAtiva
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
            render: (item: EtiquetaListItem) => (
              <input
                aria-label={`Selecionar ${item.codigo}`}
                checked={selectedIds!.has(item.id)}
                onChange={() => onToggleSelect!(item.id)}
                type="checkbox"
              />
            ),
          },
        ]
      : []),
    {
      key: 'titulo',
      header: 'Etiqueta',
      render: (item: EtiquetaListItem) => (
        <div>
          <strong>{item.titulo}</strong>
          <div className="panel-copy">{item.codigo}</div>
        </div>
      ),
    },
    { key: 'modelo', header: 'Modelo', render: (item: EtiquetaListItem) => item.modelo },
    { key: 'formato', header: 'Formato', render: (item: EtiquetaListItem) => item.formato },
    { key: 'origem', header: 'Origem', render: (item: EtiquetaListItem) => item.moduloOrigem },
    { key: 'copias', header: 'Cópias', render: (item: EtiquetaListItem) => item.quantidadeCopias },
    {
      key: 'status',
      header: 'Status',
      render: (item: EtiquetaListItem) => {
        const meta = getTone(item.status);
        return <StatusBadge text={meta.text} tone={meta.tone} />;
      },
    },
    {
      key: 'acoes',
      header: 'Ações',
      render: (item: EtiquetaListItem) => (
        <div className="table-actions">
          {canEdit ? (
            <TableIconButton label="Editar etiqueta" onClick={() => onEdit(item)}>
              <IconPencil />
            </TableIconButton>
          ) : null}
          {canAdminister ? (
            <TableIconButton
              disabled={item.status === 'impressa' || item.status === 'cancelada'}
              label={
                item.status === 'impressa'
                  ? 'Já marcada como impressa'
                  : item.status === 'cancelada'
                    ? 'Etiqueta cancelada — não pode marcar impressa'
                    : 'Marcar como impressa'
              }
              onClick={() => onStatus(item, 'impressa')}
              tone="accent"
            >
              <IconCheck />
            </TableIconButton>
          ) : null}
          {canAdminister ? (
            <TableIconButton
              disabled={item.status === 'cancelada' || item.status === 'impressa'}
              label={
                item.status === 'cancelada'
                  ? 'Já cancelada'
                  : item.status === 'impressa'
                    ? 'Impressa — não pode cancelar neste fluxo'
                    : 'Cancelar etiqueta'
              }
              onClick={() => onStatus(item, 'cancelada')}
              tone="danger"
            >
              <IconBan />
            </TableIconButton>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      emptyDescription="Gere etiquetas a partir de um recebimento ou ajuste o filtro."
      emptyText="Nenhuma etiqueta encontrada"
      getRowClassName={(item) =>
        getTableRowClassName(item.status === 'cancelada' ? 'critical' : item.status === 'pronta' ? 'warning' : 'normal')
      }
      getRowKey={(item) => item.id}
      items={items}
    />
  );
}
