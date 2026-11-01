import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconEye, IconLockOpen, IconPencil, IconTrash } from '../../../components/ui/TableActionIcons';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { RecebimentoListItem } from '../types/recebimento.types';
import { textoModoRecebimentoListagem } from '../utils/modoRecebimentoExibicao';

type Props = {
  items: RecebimentoListItem[];
  /** Abre o recebimento completo em modo somente leitura (sempre disponivel). */
  onView: (item: RecebimentoListItem) => void;
  /** Editar apenas em aguardando conferencia; use Visualizar para conferidos. */
  onEdit: (item: RecebimentoListItem) => void;
  onCancel: (item: RecebimentoListItem) => void;
  onExcluirDefinitivo?: (item: RecebimentoListItem) => void;
  /** Destravar recebimento conferido (senha na pagina) — editar ou administrar. */
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
  if (status === 'conferido') return createStatusMeta('Conferido', 'ok');
  if (status === 'cancelado') return createStatusMeta('Cancelado', 'neutral');
  if (status === 'aguardando_conferencia') return createStatusMeta('Aguardando', 'warning');
  if (status === 'parcialmente_conferido') return createStatusMeta('Parcial', 'warning');
  if (status === 'divergente') return createStatusMeta('Divergente', 'danger');
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
        {
          key: 'modo',
          header: 'Modo',
          render: (item) => textoModoRecebimentoListagem(item.modoRecebimento, item.status, item.dataConferencia),
        },
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
          render: (item) => {
            const cancelDisabled = item.status === 'cancelado' || item.status !== 'aguardando_conferencia';
            const excluirDisabled = !statusPermiteExclusaoDefinitivaRecebimento(item.status);
            return (
              <div className="table-actions">
                <TableIconButton label="Visualizar" onClick={() => void onView(item)}>
                  <IconEye />
                </TableIconButton>
                {canEdit && item.status === 'aguardando_conferencia' ? (
                  <TableIconButton label="Editar" onClick={() => void onEdit(item)}>
                    <IconPencil />
                  </TableIconButton>
                ) : canEdit ? (
                  <TableIconButton
                    disabled
                    label={
                      item.status === 'cancelado'
                        ? 'Recebimento cancelado — nao e possivel editar.'
                        : item.status === 'conferido' ||
                            item.status === 'parcialmente_conferido' ||
                            item.status === 'divergente'
                          ? 'Recebimento ja conferido — edicao bloqueada. Use Destravar (cadeado + a sua senha) e depois Editar.'
                          : 'Edicao disponivel apenas com status aguardando conferencia.'
                    }
                  >
                    <IconPencil />
                  </TableIconButton>
                ) : null}
                {(canEdit || canAdminister) && onDestravar && statusPermiteDestravarRecebimento(item.status) ? (
                  <TableIconButton
                    label={
                      canAdminister
                        ? 'Volta para aguardando conferencia (com senha), mantendo a conferencia feita, para corrigir itens ou cancelar/excluir.'
                        : 'Destravar para correcao (exige a sua senha). Depois pode editar. Cancelar/excluir continua so para administrador.'
                    }
                    onClick={() => onDestravar(item)}
                  >
                    <IconLockOpen />
                  </TableIconButton>
                ) : null}
                {canAdminister ? (
                  <>
                    <TableIconButton
                      disabled={cancelDisabled}
                      label={
                        item.status === 'cancelado'
                          ? 'Recebimento ja cancelado.'
                          : item.status !== 'aguardando_conferencia'
                            ? 'So recebimentos aguardando conferencia podem ser cancelados. Destrave com senha se precisar corrigir.'
                            : 'Cancelar recebimento'
                      }
                      onClick={() => onCancel(item)}
                      tone="danger"
                    >
                      <IconBan />
                    </TableIconButton>
                    {onExcluirDefinitivo ? (
                      <TableIconButton
                        disabled={excluirDisabled}
                        label={
                          statusPermiteExclusaoDefinitivaRecebimento(item.status)
                            ? 'Remove o recebimento do cadastro (irreversivel). Exige senha.'
                            : 'So e possivel excluir recebimentos aguardando conferencia, cancelados ou rascunho.'
                        }
                        onClick={() => onExcluirDefinitivo(item)}
                        tone="danger"
                      >
                        <IconTrash />
                      </TableIconButton>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          },
        },
      ]}
      emptyDescription="Registe um recebimento ou ajuste o filtro de busca/status."
      emptyText="Nenhum recebimento encontrado"
      items={items}
    />
  );
}
