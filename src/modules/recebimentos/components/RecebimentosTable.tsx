import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { RecebimentoListItem } from '../types/recebimento.types';

type Props = {
  items: RecebimentoListItem[];
  /** Abre o recebimento completo em modo somente leitura (sempre disponivel). */
  onView: (item: RecebimentoListItem) => void;
  /** Editar apenas em aguardando conferencia; use Visualizar para conferidos. */
  onEdit: (item: RecebimentoListItem) => void;
  onCancel: (item: RecebimentoListItem) => void;
  onExcluirDefinitivo?: (item: RecebimentoListItem) => void;
  /** Destravar recebimento conferido (senha na pagina) — requer administrar. */
  onDestravar?: (item: RecebimentoListItem) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectPagina?: () => void;
  canEdit: boolean;
  canAdminister: boolean;
};

function statusPermiteExclusaoDefinitivaRecebimento(status: RecebimentoListItem['status']) {
  return status === 'aguardando_conferencia' || status === 'cancelado' || status === 'rascunho';
}

function statusPermiteDestravarRecebimento(status: RecebimentoListItem['status']) {
  return status === 'conferido' || status === 'parcialmente_conferido' || status === 'divergente';
}

function getStatusMeta(status: RecebimentoListItem['status']) {
  if (status === 'conferido') return createStatusMeta(status, 'ok');
  if (status === 'cancelado') return createStatusMeta(status, 'neutral');
  if (status === 'aguardando_conferencia' || status === 'parcialmente_conferido') return createStatusMeta(status, 'warning');
  return createStatusMeta(status, 'danger');
}

export function RecebimentosTable({
  items,
  onView,
  onEdit,
  onCancel,
  onExcluirDefinitivo,
  onDestravar,
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
            : item.conferenciaItensDivergentes > 0
              ? 'critical'
              : item.status === 'aguardando_conferencia' || item.status === 'parcialmente_conferido'
                ? 'warning'
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
                    aria-label="Selecionar todos desta pagina"
                    checked={allPageSelected}
                    onChange={onToggleSelectPagina}
                    ref={headerCbRef}
                    type="checkbox"
                  />
                ),
                render: (item: RecebimentoListItem) => (
                  <input
                    aria-label={`Selecionar recebimento ${item.notaFiscal || item.id}`}
                    checked={selectedIds!.has(item.id)}
                    onChange={() => onToggleSelect!(item.id)}
                    type="checkbox"
                  />
                ),
              },
            ]
          : []),
        { key: 'fornecedor', header: 'Fornecedor', render: (item) => item.fornecedor },
        { key: 'nota', header: 'NF / Romaneio', render: (item) => `${item.notaFiscal || '-'} / ${item.romaneio || '-'}` },
        { key: 'data', header: 'Data', render: (item) => item.dataRecebimento },
        { key: 'modo', header: 'Modo', render: (item) => item.modoRecebimento },
        { key: 'itens', header: 'Itens', render: (item) => item.totalItens },
        {
          key: 'status',
          header: 'Status',
          render: (item) => {
            const meta = getStatusMeta(item.status);
            return (
              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                <StatusBadge text={meta.text} tone={meta.tone} />
                {item.conferenciaItensDivergentes > 0 ? (
                  <span className="recebimento-badge-divergencia" title="Quantidade conferida abaixo da NF nestas linhas">
                    {item.conferenciaItensDivergentes} linha(s) com divergência
                  </span>
                ) : null}
              </span>
            );
          },
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) => (
            <div className="table-actions">
              <Button onClick={() => void onView(item)} type="button" variant="ghost">
                Visualizar
              </Button>
              {canEdit && item.status === 'aguardando_conferencia' ? (
                <Button onClick={() => void onEdit(item)} type="button" variant="ghost">
                  Editar
                </Button>
              ) : null}
              {canAdminister && onDestravar && statusPermiteDestravarRecebimento(item.status) ? (
                <Button
                  onClick={() => onDestravar(item)}
                  title="Volta para aguardando conferencia (com senha) para permitir edicao, cancelamento ou exclusao."
                  type="button"
                  variant="ghost"
                >
                  Destravar...
                </Button>
              ) : null}
              {canAdminister ? (
                <>
                  <ActionButton
                    disabled={item.status === 'cancelado' || item.status !== 'aguardando_conferencia'}
                    disabledLabel={item.status === 'cancelado' ? 'Cancelado' : 'Travado'}
                    disabledTitle={
                      item.status === 'cancelado'
                        ? 'Recebimento ja cancelado.'
                        : item.status !== 'aguardando_conferencia'
                          ? 'So recebimentos aguardando conferencia podem ser cancelados. Destrave com senha se precisar corrigir.'
                          : 'Cancelar recebimento'
                    }
                    enabledLabel="Cancelar"
                    enabledTitle="Cancelar recebimento"
                    onClick={() => onCancel(item)}
                    variant="danger"
                  />
                  {onExcluirDefinitivo ? (
                    <Button
                      disabled={!statusPermiteExclusaoDefinitivaRecebimento(item.status)}
                      onClick={() => onExcluirDefinitivo(item)}
                      title={
                        statusPermiteExclusaoDefinitivaRecebimento(item.status)
                          ? 'Remove o recebimento do cadastro (irreversivel). Exige senha.'
                          : 'So e possivel excluir recebimentos aguardando conferencia, cancelados ou rascunho.'
                      }
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
