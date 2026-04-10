import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { DocumentoListItem } from '../types/documento.types';

type Props = {
  items: DocumentoListItem[];
  onEdit: (item: DocumentoListItem) => void;
  /** Lista itens do documento (somente leitura), qualquer status. */
  onView?: (item: DocumentoListItem) => void;
  onCancel: (item: DocumentoListItem) => void;
  /** Remove o documento do planejamento (senha na pagina). */
  onExcluirDefinitivo?: (item: DocumentoListItem) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectPagina?: () => void;
  canEdit: boolean;
  canAdminister: boolean;
};

function getStatusMeta(status: DocumentoListItem['status']) {
  if (status === 'atendido') return createStatusMeta(status, 'ok');
  if (status === 'recebido') return createStatusMeta(status, 'neutral');
  if (status === 'cancelado') return createStatusMeta(status, 'neutral');
  if (status === 'parcial') return createStatusMeta(status, 'warning');
  return createStatusMeta(status, 'danger');
}

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

export function DocumentosTable({
  items,
  onEdit,
  onView,
  onCancel,
  onExcluirDefinitivo,
  selectedIds,
  onToggleSelect,
  onToggleSelectPagina,
  canEdit,
  canAdminister,
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
      getRowKey={(item) => item.id}
      getRowClassName={(item) =>
        getTableRowClassName(
          item.status === 'cancelado'
            ? 'critical'
            : item.status === 'parcial'
              ? 'warning'
              : item.status === 'recebido'
                ? 'normal'
                : 'normal',
        )
      }
      columns={[
        ...(selecaoExclusaoAtiva
          ? [
              {
                key: 'selecionar',
                header: (
                  <input
                    aria-label="Selecionar apenas os documentos desta pagina (para o filtro completo use o botao abaixo da tabela)"
                    checked={allPageSelected}
                    onChange={onToggleSelectPagina}
                    ref={headerCbRef}
                    type="checkbox"
                  />
                ),
                render: (item: DocumentoListItem) => (
                  <input
                    aria-label={`Selecionar documento ${item.numero}`}
                    checked={selectedIds!.has(item.id)}
                    onChange={() => onToggleSelect!(item.id)}
                    type="checkbox"
                  />
                ),
              },
            ]
          : []),
        { key: 'numero', header: 'Documento', render: (item) => `${item.numero} Rev. ${item.revisao}` },
        { key: 'descricao', header: 'Descricao', render: (item) => item.descricao },
        { key: 'responsavel', header: 'Responsavel', render: (item) => item.responsavel || '-' },
        { key: 'data', header: 'Data', render: (item) => item.dataDocumento },
        { key: 'itens', header: 'Itens', render: (item) => item.totalItens },
        {
          key: 'qPrev',
          header: 'Quantidade do documento',
          render: (item) => fmtQty(item.quantidadePlanejada),
        },
        {
          key: 'qAtd',
          header: 'Qtd atendida',
          render: (item) => fmtQty(item.quantidadeAtendida),
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => {
            const meta = getStatusMeta(item.status);
            return <StatusBadge text={meta.text} tone={meta.tone} />;
          },
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) => (
            <div className="table-actions">
              {onView ? (
                <Button onClick={() => onView(item)} type="button" variant="ghost">
                  Visualizar
                </Button>
              ) : null}
              {canEdit ? (
                <Button onClick={() => onEdit(item)} variant="ghost">
                  Editar
                </Button>
              ) : null}
              {canAdminister ? (
                <>
                  <ActionButton
                    disabled={item.status === 'cancelado'}
                    disabledLabel="Cancelado"
                    disabledTitle="Documento ja cancelado."
                    enabledLabel={item.status === 'pendente' ? 'Cancelar' : 'Cancelar (adm.)'}
                    enabledTitle={
                      item.status === 'pendente'
                        ? 'Cancelar documento pendente.'
                        : 'Cancelamento administrativo: exige justificativa. Nao estorna recebimentos nem atendimentos.'
                    }
                    onClick={() => onCancel(item)}
                    variant="danger"
                  />
                  {onExcluirDefinitivo ? (
                    <Button
                      onClick={() => onExcluirDefinitivo(item)}
                      title="Remove o documento do planejamento (irreversivel). Exige senha de administrador."
                      type="button"
                      variant="ghost"
                    >
                      Excluir definitivamente
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ),
        },
      ]}
      items={items}
    />
  );
}
