import { useEffect, useRef } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconEye, IconList, IconPencil, IconTrash } from '../../../components/ui/TableActionIcons';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { DocumentoListItem } from '../types/documento.types';
import { formatarDataDocumentoPtBr } from '../utils/formatarDataDocumento';

type Props = {
  items: DocumentoListItem[];
  onEdit: (item: DocumentoListItem) => void;
  /** Folha de campo (PDF) numa janela separada. */
  onVisualizar?: (item: DocumentoListItem) => void;
  /** Itens do documento num modal dentro do sistema. */
  onVerItens?: (item: DocumentoListItem) => void;
  visualizarBusyId?: string | null;
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
  if (status === 'atendido') return createStatusMeta('Atendido', 'ok');
  if (status === 'recebido') return createStatusMeta('Recebido', 'info');
  if (status === 'cancelado') return createStatusMeta('Cancelado', 'neutral');
  if (status === 'parcial') return createStatusMeta('Parcial', 'warning');
  return createStatusMeta('Pendente', 'danger');
}

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function progressoAtendimento(item: DocumentoListItem): { pct: number; label: string; title: string } {
  const plan = Math.max(0, Number(item.quantidadePlanejada) || 0);
  const atd = Math.max(0, Number(item.quantidadeAtendida) || 0);
  const pct = plan > 0 ? Math.min(100, Math.round((atd / plan) * 100)) : 0;
  return {
    pct,
    label: `${pct}%`,
    title: `Atendimento: ${fmtQty(atd)} de ${fmtQty(plan)} (${pct}%)`,
  };
}

function statusAjuda(status: DocumentoListItem['status']): string {
  if (status === 'atendido') return 'Todas as linhas foram baixadas neste documento.';
  if (status === 'recebido')
    return 'Material já no estoque (recebimento). Qtd. atendida pode ser 0% até baixar no Atendimento.';
  if (status === 'parcial')
    return 'Há estoque e/ou baixa parcial. Qtd. atendida 0% ainda pode ser Parcial se já entrou material no estoque.';
  if (status === 'cancelado') return 'Documento cancelado.';
  return 'Sem saldo/estoque relevante para cumprir o documento.';
}

export function DocumentosTable({
  items,
  onEdit,
  onVisualizar,
  onVerItens,
  visualizarBusyId,
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
      emptyDescription="Cadastre um desenho ou ajuste o filtro de busca/status."
      emptyText="Nenhum documento no planejamento"
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
        { key: 'descricao', header: 'Descrição', render: (item) => item.descricao },
        { key: 'responsavel', header: 'Responsável', render: (item) => item.responsavel || '—' },
        { key: 'data', header: 'Data', render: (item) => formatarDataDocumentoPtBr(item.dataDocumento) },
        { key: 'itens', header: 'Itens', render: (item) => item.totalItens },
        {
          key: 'qPrev',
          header: 'Qtd. documento',
          render: (item) => fmtQty(item.quantidadePlanejada),
        },
        {
          key: 'qAtd',
          header: 'Qtd. atendida',
          render: (item) => {
            const prog = progressoAtendimento(item);
            return (
              <span className="documentos-atend-cell" title={prog.title}>
                <span className="documentos-atend-qty">{fmtQty(item.quantidadeAtendida)}</span>
                <span className="documentos-atend-bar" aria-hidden>
                  <span className="documentos-atend-bar-fill" style={{ width: `${prog.pct}%` }} />
                </span>
                <span className="documentos-atend-pct">{prog.label}</span>
              </span>
            );
          },
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => {
            const meta = getStatusMeta(item.status);
            return (
              <span title={statusAjuda(item.status)}>
                <StatusBadge text={meta.text} tone={meta.tone} />
              </span>
            );
          },
        },
        {
          key: 'acoes',
          header: 'Ações',
          render: (item) => (
            <div className="table-actions">
              {onVisualizar ? (
                <TableIconButton
                  disabled={visualizarBusyId === item.id}
                  label={visualizarBusyId === item.id ? 'A abrir folha…' : 'Ver folha de campo'}
                  onClick={() => onVisualizar(item)}
                  tone="accent"
                >
                  <IconEye />
                </TableIconButton>
              ) : null}
              {onVerItens ? (
                <TableIconButton label="Ver itens do documento" onClick={() => onVerItens(item)}>
                  <IconList />
                </TableIconButton>
              ) : null}
              {canEdit ? (
                <TableIconButton label="Editar documento" onClick={() => onEdit(item)}>
                  <IconPencil />
                </TableIconButton>
              ) : null}
              {canAdminister ? (
                <>
                  <TableIconButton
                    disabled={item.status === 'cancelado'}
                    label={
                      item.status === 'cancelado'
                        ? 'Documento já cancelado'
                        : item.status === 'pendente'
                          ? 'Cancelar documento pendente'
                          : 'Cancelar documento (administrativo)'
                    }
                    onClick={() => onCancel(item)}
                    tone="danger"
                  >
                    <IconBan />
                  </TableIconButton>
                  {onExcluirDefinitivo ? (
                    <TableIconButton
                      label="Excluir documento definitivamente"
                      onClick={() => onExcluirDefinitivo(item)}
                      tone="danger"
                    >
                      <IconTrash />
                    </TableIconButton>
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
