import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName, type TableRowState } from '../../../components/tables/tableRowState';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Equipamento } from '../types/equipamento.types';
import { diasAteFimContrato, labelSituacaoContrato, situacaoContratoFromDias } from '../utils/equipamentoContrato';
function statusOperacaoTone(status: Equipamento['statusEquipamento']): 'ok' | 'warning' | 'neutral' {
  if (status === 'operando') return 'ok';
  if (status === 'manutencao') return 'warning';
  return 'neutral';
}

function statusOperacaoLabel(status: Equipamento['statusEquipamento']): string {
  if (status === 'operando') return 'Em operação';
  if (status === 'manutencao') return 'Manutenção';
  if (status === 'parado') return 'Parado';
  return 'Em trânsito';
}

function rowState(item: Equipamento): TableRowState {
  const dias = diasAteFimContrato(item.dataFimContrato);
  const sit = situacaoContratoFromDias(dias);
  if (sit === 'vencido') return 'critical';
  if (sit === 'proximo' || item.statusEquipamento === 'manutencao' || item.statusEquipamento === 'parado') return 'warning';
  return 'normal';
}

type Props = {
  items: Equipamento[];
  onEdit: (item: Equipamento) => void;
  onDelete?: (item: Equipamento) => void;
  canEdit: boolean;
};

export function EquipamentosTable({ items, onEdit, onDelete, canEdit }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(rowState(item))}
      columns={[
        {
          key: 'equipamento',
          header: 'Equipamento',
          render: (item) => (
            <div>
              <strong>{item.tipoEquipamento}</strong>
              <div className="panel-copy">
                Nº frota {item.codigo}
                {item.placa ? ` · ${item.placa}` : ''}
              </div>
            </div>
          ),
        },
        {
          key: 'operador',
          header: 'Operador',
          render: (item) => (
            <div>
              {item.nomeOperador || '-'}
              {item.telefoneOperador ? <div className="panel-copy">{item.telefoneOperador}</div> : null}
            </div>
          ),
        },
        {
          key: 'empresa',
          header: 'Empresa / setor',
          render: (item) => (
            <div>
              {item.empresaContratada || '-'}
              {item.setorResponsavel ? <div className="panel-copy">{item.setorResponsavel}</div> : null}
            </div>
          ),
        },
        {
          key: 'contrato',
          header: 'Contrato e prazo',
          render: (item) => {
            const dias = diasAteFimContrato(item.dataFimContrato);
            const sit = situacaoContratoFromDias(dias);
            const tone = sit === 'vencido' ? 'danger' : sit === 'proximo' ? 'warning' : sit === 'em_dia' ? 'ok' : 'neutral';
            return (
              <div>
                {item.numeroContrato ? <div>{item.numeroContrato}</div> : <span className="panel-copy">—</span>}
                <div className="panel-copy">
                  {item.dataInicioProjeto || '—'} → {item.dataFimContrato || '—'}
                </div>
                <StatusBadge text={labelSituacaoContrato(sit)} tone={tone} />
              </div>
            );
          },
        },
        {
          key: 'status',
          header: 'No canteiro',
          render: (item) => <StatusBadge text={statusOperacaoLabel(item.statusEquipamento)} tone={statusOperacaoTone(item.statusEquipamento)} />,
        },
        {
          key: 'acoes',
          header: 'Ações',
          render: (item) =>
            canEdit ? (
              <div className="table-actions">
                <Button onClick={() => onEdit(item)} variant="ghost">
                  Editar
                </Button>
                {onDelete ? (
                  <Button onClick={() => onDelete(item)} variant="ghost">
                    Excluir
                  </Button>
                ) : null}
              </div>
            ) : null,
        },
      ]}
      emptyText="Nenhum equipamento encontrado."
      items={items}
    />
  );
}
