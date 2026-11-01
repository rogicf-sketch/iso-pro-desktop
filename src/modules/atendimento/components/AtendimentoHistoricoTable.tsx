import { ListPageShell } from '../../../components/layout/ListPageShell';
import { DataTable } from '../../../components/tables/DataTable';
import { Pagination } from '../../../components/tables/Pagination';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { Input } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconEye, IconUndo } from '../../../components/ui/TableActionIcons';
import {
  ATENDIMENTO_HISTORICO_PAGE_SIZE,
  type HistoricoPeriodoFiltro,
} from '../hooks/useAtendimento';
import type { Atendimento } from '../types/atendimento.types';

type Props = {
  /** Pagina ja filtrada (nuvem) ou fatia local. */
  items: Atendimento[];
  totalCount: number;
  page: number;
  onPageChange: (page: number) => void;
  busca: string;
  onBuscaChange: (busca: string) => void;
  periodo: HistoricoPeriodoFiltro;
  onPeriodoChange: (periodo: HistoricoPeriodoFiltro) => void;
  onVerRecibo: (item: Atendimento) => void | Promise<void>;
  /** Id do atendimento montando recibo (desabilita botao na linha). */
  reciboCarregandoId?: string | null;
  onEstornar: (item: Atendimento) => void;
  canAdminister: boolean;
  /** A carregar arquivo da nuvem (primeira vez na zona Historico). */
  loading?: boolean;
};

const PERIODOS: Array<{ id: HistoricoPeriodoFiltro; rotulo: string }> = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: 'todos', rotulo: 'Todos' },
];

export function AtendimentoHistoricoTable({
  items,
  totalCount,
  page,
  onPageChange,
  busca,
  onBuscaChange,
  periodo,
  onPeriodoChange,
  onVerRecibo,
  reciboCarregandoId,
  onEstornar,
  canAdminister,
  loading = false,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / ATENDIMENTO_HISTORICO_PAGE_SIZE));
  const pageSegura = Math.min(Math.max(page, 1), totalPages);
  const de = totalCount === 0 ? 0 : (pageSegura - 1) * ATENDIMENTO_HISTORICO_PAGE_SIZE + 1;
  const ate = Math.min(pageSegura * ATENDIMENTO_HISTORICO_PAGE_SIZE, totalCount);

  return (
    <ListPageShell
      asPanel={false}
      className="atendimento-historico-list"
      filters={
        <div className="filters-grid filters-grid--atendimento-historico">
          <div className="atendimento-filter-period">
            <span id="historico-periodo-label">Periodo</span>
            <div
              aria-labelledby="historico-periodo-label"
              className="atendimento-filter-period__btns"
              role="group"
            >
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={periodo === p.id}
                  className={`atendimento-filter-period__btn${periodo === p.id ? ' atendimento-filter-period__btn--active' : ''}`}
                  onClick={() => onPeriodoChange(p.id)}
                  type="button"
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
          </div>
          <Input
            autoComplete="off"
            id="historico-atendimento-busca"
            label="Busca"
            onChange={(e) => onBuscaChange(e.target.value)}
            placeholder="Numero, documento, atendente, recebedor, material…"
            spellCheck={false}
            type="search"
            value={busca}
          />
        </div>
      }
      beforeTable={
        loading && items.length === 0 ? (
          <p className="panel-copy atendimento-historico-meta">A carregar lotes…</p>
        ) : totalCount > 0 || items.length > 0 ? (
          <p className="panel-copy atendimento-historico-meta">
            {de}–{ate} de {totalCount}
          </p>
        ) : null
      }
      pagination={
        totalCount > 0 ? (
          <Pagination
            itemLabel="lotes"
            onPageChange={onPageChange}
            page={pageSegura}
            pageSize={ATENDIMENTO_HISTORICO_PAGE_SIZE}
            total={totalCount}
          />
        ) : undefined
      }
    >
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
              <TableIconButton
                disabled={reciboCarregandoId === item.id}
                label={reciboCarregandoId === item.id ? 'Abrindo...' : 'Visualizar'}
                onClick={() => void onVerRecibo(item)}
              >
                <IconEye />
              </TableIconButton>
            ),
          },
          {
            key: 'estorno',
            header: 'Estorno',
            render: (item) =>
              canAdminister ? (
                <TableIconButton
                  disabled={item.status === 'estornado'}
                  label={
                    item.status === 'estornado'
                      ? 'Atendimento ja estornado.'
                      : 'Abrir fluxo de estorno (parcial ou total)'
                  }
                  onClick={() => onEstornar(item)}
                  tone="danger"
                >
                  <IconUndo />
                </TableIconButton>
              ) : (
                <span className="panel-copy">—</span>
              ),
          },
        ]}
        emptyDescription={
          loading
            ? undefined
            : totalCount === 0 && periodo === 'todos' && !busca.trim()
              ? 'Os atendimentos confirmados passam a aparecer neste arquivo.'
              : 'Tente «Todos» ou limpe o filtro de período/busca.'
        }
        emptyText={
          loading
            ? 'A carregar…'
            : totalCount === 0 && periodo === 'todos' && !busca.trim()
              ? 'Nenhum registro no arquivo ainda'
              : 'Nenhum lote neste período/busca'
        }
        items={items}
      />
    </ListPageShell>
  );
}
