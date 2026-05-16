import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { RirRegistro } from '../types/qualidade.types';

type Props = {
  items: RirRegistro[];
  onEdit: (item: RirRegistro) => void;
  onPrint: (item: RirRegistro) => void;
  onVisualizar: (item: RirRegistro) => void;
  onDelete?: (item: RirRegistro) => void;
  /** Destravar RIR `tratado` com senha (permissao administrar). */
  onDestravar?: (item: RirRegistro) => void;
  canEdit: boolean;
  canAdministrarRir?: boolean;
};

function laudoLabel(l: RirRegistro['laudo']) {
  if (l === 'reprovado') return 'Reprovado';
  if (l === 'observacoes') return 'Observacoes';
  return 'Aprovado';
}

function tone(status: RirRegistro['status']) {
  if (status === 'tratado') return createStatusMeta(status, 'ok');
  if (status === 'cancelado') return createStatusMeta(status, 'neutral');
  if (status === 'em_analise') return createStatusMeta(status, 'warning');
  return createStatusMeta(status, 'danger');
}

export function RirTable({
  items,
  onEdit,
  onPrint,
  onVisualizar,
  onDelete,
  onDestravar,
  canEdit,
  canAdministrarRir,
}: Props) {
  return (
    <DataTable
      getRowClassName={(item) =>
        getTableRowClassName(item.status === 'aberto' ? 'critical' : item.status === 'em_analise' ? 'warning' : 'normal')
      }
      columns={[
        { key: 'codigo', header: 'Nº RIR', render: (item) => item.codigo },
        { key: 'data', header: 'Data', render: (item) => item.dataRegistro },
        { key: 'forn', header: 'Fornecedor', render: (item) => item.fornecedorNome || item.recebimentoFornecedor || '—' },
        { key: 'nf', header: 'NF', render: (item) => item.recebimentoNotaFiscal ?? '—' },
        { key: 'proc', header: 'Procedimento', render: (item) => (item.procedimentoNumero ? item.procedimentoNumero.slice(0, 28) : '—') },
        { key: 'laudo', header: 'Laudo', render: (item) => laudoLabel(item.laudo) },
        {
          key: 'status',
          header: 'Status',
          render: (item) => {
            const meta = tone(item.status);
            return <StatusBadge text={meta.text} tone={meta.tone} />;
          },
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) => (
            <div className="table-actions">
              <ActionButton
                enabledLabel="Visualizar"
                enabledTitle="Pre-visualizar relatorio RIR (impressao / PDF)"
                onClick={() => onVisualizar(item)}
                variant="ghost"
              />
              <ActionButton enabledLabel="Imprimir" enabledTitle="Imprimir RIR" onClick={() => onPrint(item)} variant="ghost" />
              {canAdministrarRir && onDestravar && item.status === 'tratado' ? (
                <ActionButton
                  enabledLabel="Destravar"
                  enabledTitle="Destravar RIR finalizado (senha) para voltar a Em analise e permitir edicao"
                  onClick={() => onDestravar(item)}
                  variant="ghost"
                />
              ) : null}
              {canEdit && onDelete ? (
                <ActionButton
                  disabled={item.status === 'tratado' || item.status === 'cancelado'}
                  disabledLabel={item.status === 'cancelado' ? 'Cancelado' : 'Travado'}
                  disabledTitle={
                    item.status === 'cancelado'
                      ? 'RIR cancelado nao pode ser excluido por este fluxo.'
                      : 'RIR tratado nao pode ser excluido por este fluxo.'
                  }
                  enabledLabel="Excluir"
                  enabledTitle="Excluir RIR"
                  onClick={() => onDelete(item)}
                  variant="danger"
                />
              ) : null}
              {canEdit ? (
                <ActionButton
                  disabled={item.status === 'tratado' || item.status === 'cancelado'}
                  disabledLabel={item.status === 'cancelado' ? 'Cancelado' : 'Travado'}
                  disabledTitle={
                    item.status === 'cancelado'
                      ? 'RIR cancelado nao pode ser editado por este fluxo.'
                      : 'RIR tratado nao pode ser editado por este fluxo.'
                  }
                  enabledLabel="Editar"
                  enabledTitle="Editar RIR"
                  onClick={() => onEdit(item)}
                  variant="ghost"
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
