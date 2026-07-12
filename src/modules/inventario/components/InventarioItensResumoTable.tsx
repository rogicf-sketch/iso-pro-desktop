import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import type { InventarioItem } from '../types/inventario.types';

type Props = {
  itens: InventarioItem[];
  saldoPorCodigo: Map<string, number>;
};

export function InventarioItensResumoTable({ itens, saldoPorCodigo }: Props) {
  if (!itens.length) return null;

  return (
    <div className="editor-block" style={{ marginBottom: '16px' }}>
      <div className="editor-header">
        <div>
          <p className="panel-kicker">Resumo</p>
          <strong>Itens do inventario</strong>
        </div>
      </div>
      <DataTable
        columns={[
          {
            key: 'codigo',
            header: 'Codigo',
            render: (item) => item.codigoMaterial || '—',
          },
          {
            key: 'descricao',
            header: 'Descricao',
            render: (item) => item.descricaoMaterial || '—',
          },
          {
            key: 'saldoInventario',
            header: 'Saldo invent.',
            render: (item) => String(item.saldoSistema),
          },
          {
            key: 'estoque',
            header: 'Estoque actual',
            render: (item) => {
              const saldo = saldoPorCodigo.get(codigoMaterialKey(item.codigoMaterial));
              return saldo !== undefined ? String(saldo) : '—';
            },
          },
          {
            key: 'contada',
            header: 'Qtd contada',
            render: (item) => String(item.quantidadeContada),
          },
          {
            key: 'local',
            header: 'Local contagem',
            render: (item) => item.localizacaoContada?.trim() || '—',
          },
        ]}
        getRowClassName={(item) =>
          getTableRowClassName(item.quantidadeContada !== item.saldoSistema ? 'warning' : 'normal')
        }
        getRowKey={(item) => item.id}
        items={itens}
      />
    </div>
  );
}
