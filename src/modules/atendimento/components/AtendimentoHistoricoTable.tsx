import { useMemo, useState } from 'react';
import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Atendimento } from '../types/atendimento.types';
import { filtrarAtendimentosPorBusca } from '../utils/filtrarHistoricoAtendimentoBusca';

type Props = {
  items: Atendimento[];
  onVerRecibo: (item: Atendimento) => void | Promise<void>;
  /** Id do atendimento montando recibo (desabilita botao na linha). */
  reciboCarregandoId?: string | null;
  onEstornar: (item: Atendimento) => void;
  canAdminister: boolean;
};

export function AtendimentoHistoricoTable({ items, onVerRecibo, reciboCarregandoId, onEstornar, canAdminister }: Props) {
  const [busca, setBusca] = useState('');

  const filtrados = useMemo(() => filtrarAtendimentosPorBusca(items, busca), [items, busca]);

  return (
    <div className="stack-grid">
      <div className="form-grid">
        <Input
          autoComplete="off"
          id="historico-atendimento-busca"
          label="Pesquisar lotes"
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Numero do atendimento, documento, atendente, recebedor, material (codigo ou texto)…"
          spellCheck={false}
          type="search"
          value={busca}
        />
      </div>
      {items.length > 0 ? (
        <p className="panel-copy">
          Exibindo <strong>{filtrados.length}</strong> de <strong>{items.length}</strong> lote(s)
          {busca.trim() ? ` — filtro: "${busca.trim()}"` : ''}.
        </p>
      ) : null}

      <DataTable
      getRowClassName={(item) => getTableRowClassName(item.status === 'estornado' ? 'critical' : 'normal')}
      columns={[
        { key: 'numero', header: 'Numero', render: (item) => item.numero },
        { key: 'documento', header: 'Documento', render: (item) => item.documentoNumero },
        { key: 'atendente', header: 'Atendente', render: (item) => item.atendente },
        {
          key: 'recebedor',
          header: 'Recebedor',
          render: (item) => (
            <div>
              <strong>{item.recebedor}</strong>
              <div className="panel-copy">
                {item.recebedorTipo === 'interno'
                  ? 'Interno'
                  : `${item.recebedorEmpresa || 'Externo'}${item.autorizadorInterno ? ` • Autorizado por ${item.autorizadorInterno}` : ''}`}
              </div>
            </div>
          ),
        },
        {
          key: 'itens',
          header: 'Total',
          render: (item) => item.itens.reduce((total, linha) => total + linha.quantidadeAtendida, 0),
        },
        { key: 'data', header: 'Data', render: (item) => new Date(item.dataAtendimento).toLocaleString('pt-BR') },
        {
          key: 'status',
          header: 'Status',
          render: (item) => (
            <StatusBadge text={item.status} tone={item.status === 'concluido' ? 'ok' : 'neutral'} />
          ),
        },
        {
          key: 'recibo',
          header: 'Visualizar',
          render: (item) => (
            <Button
              disabled={reciboCarregandoId === item.id}
              onClick={() => void onVerRecibo(item)}
              type="button"
              variant="ghost"
            >
              {reciboCarregandoId === item.id ? 'Abrindo...' : 'Visualizar'}
            </Button>
          ),
        },
        {
          key: 'estorno',
          header: 'Estorno',
          render: (item) =>
            canAdminister ? (
              <ActionButton
                disabled={item.status === 'estornado'}
                disabledLabel="Estornado"
                disabledTitle="Atendimento ja estornado."
                enabledLabel="Estornar"
                enabledTitle="Abrir fluxo de estorno (parcial ou total)"
                onClick={() => onEstornar(item)}
                variant={item.status === 'estornado' ? 'ghost' : 'danger'}
              />
            ) : (
              <span className="panel-copy">—</span>
            ),
        },
      ]}
      emptyText={
        items.length === 0
          ? 'Nenhum registro encontrado.'
          : 'Nenhum lote corresponde a esta busca. Tente outro termo ou limpe o campo.'
      }
      items={filtrados}
    />
    </div>
  );
}
