import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
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
  if (status === 'rascunho') return createStatusMeta(status, 'warning');
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
        { key: 'copias', header: 'Copias', render: (item: EtiquetaListItem) => item.quantidadeCopias },
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
          header: 'Acoes',
          render: (item: EtiquetaListItem) => (
            <div className="table-actions">
              {canEdit ? (
                <Button onClick={() => onEdit(item)} variant="ghost">
                  Editar
                </Button>
              ) : null}
              {canAdminister ? (
                <ActionButton
                  disabled={item.status === 'impressa' || item.status === 'cancelada'}
                  disabledLabel={item.status === 'impressa' ? 'Impressa' : 'Travada'}
                  disabledTitle={
                    item.status === 'impressa'
                      ? 'Etiqueta ja marcada como impressa.'
                      : 'Etiquetas canceladas nao podem ser impressas.'
                  }
                  enabledLabel="Marcar impressa"
                  enabledTitle="Marcar etiqueta como impressa"
                  onClick={() => onStatus(item, 'impressa')}
                  variant="primary"
                />
              ) : null}
              {canAdminister ? (
                <ActionButton
                  disabled={item.status === 'cancelada' || item.status === 'impressa'}
                  disabledLabel={item.status === 'cancelada' ? 'Cancelada' : 'Travada'}
                  disabledTitle={
                    item.status === 'cancelada'
                      ? 'Etiqueta ja cancelada.'
                      : 'Etiquetas impressas nao podem ser canceladas por este fluxo.'
                  }
                  enabledLabel="Cancelar"
                  enabledTitle="Cancelar etiqueta"
                  onClick={() => onStatus(item, 'cancelada')}
                  variant="danger"
                />
              ) : null}
            </div>
          ),
        },
      ];

  return (
    <DataTable
      columns={columns}
      emptyText="Nenhuma etiqueta encontrada."
      getRowClassName={(item) =>
        getTableRowClassName(item.status === 'cancelada' ? 'critical' : item.status === 'pronta' ? 'warning' : 'normal')
      }
      getRowKey={(item) => item.id}
      items={items}
    />
  );
}
