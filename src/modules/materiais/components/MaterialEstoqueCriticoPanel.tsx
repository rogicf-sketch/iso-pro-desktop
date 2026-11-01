import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatDecimalExcelPtBr } from '../../../lib/csv';
import {
  listarMateriaisCriticosEstoque,
  montarExportacaoMateriaisCriticosCsv,
  type MaterialEstoqueCritico,
} from '../services/materiaisEstoqueCritico.service';

const PAGE_SIZE = 15;

type Props = {
  onChromeMeta?: (meta: string) => void;
};

export function MaterialEstoqueCriticoPanel({ onChromeMeta }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MaterialEstoqueCritico[]>([]);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await listarMateriaisCriticosEstoque();
      setItems(next);
      setPage(1);
    } catch {
      setError('Nao foi possivel carregar os materiais criticos de estoque.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const criticos = useMemo(() => items.filter((i) => i.severidade === 'critical').length, [items]);
  const atencao = items.length - criticos;

  useEffect(() => {
    if (!onChromeMeta) return;
    if (loading) {
      onChromeMeta('A carregar…');
      return;
    }
    if (items.length === 0) {
      onChromeMeta('Nenhum material em alerta');
      return;
    }
    onChromeMeta(
      `${items.length.toLocaleString('pt-BR')} em alerta · ${criticos.toLocaleString('pt-BR')} crítico(s)${
        atencao > 0 ? ` · ${atencao.toLocaleString('pt-BR')} atenção` : ''
      }`,
    );
  }, [onChromeMeta, loading, items.length, criticos, atencao]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  const exportarExcel = useCallback(() => {
    const { csv, fileName } = montarExportacaoMateriaisCriticosCsv(items);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [items]);

  return (
    <>
      <div className="panel-header panel-header--toolbar panel-header--actions-only">
        <div className="panel-toolbar">
          <div className="panel-toolbar__group" role="group" aria-label="Estoque critico">
            <span className="panel-toolbar__label">Lista</span>
            <div className="panel-toolbar__buttons">
              <Button disabled={loading} onClick={() => void load()} type="button" variant="ghost">
                {loading ? 'Atualizando...' : 'Atualizar lista'}
              </Button>
              <Button
                disabled={loading || items.length === 0}
                onClick={exportarExcel}
                title={`Exportar os ${items.length} materiais do alerta geral`}
                type="button"
                variant="ghost"
              >
                Exportar Excel
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Materiais ativos cujo <strong>saldo operacional</strong> esta abaixo do limite definido no cadastro (
          <strong>percentual do total planejado</strong> nos documentos). Configure o percentual em Cadastro → Editar
          material. E-mail para itens <strong>criticos</strong> em Configuracoes → Alertas; com Supabase, o envio pode
          rodar na nuvem (cron) sem PC aberto.
        </p>
      </ModuleHelp>

      {error ? <div className="error-box">{error}</div> : null}
      {loading ? <OperationalNotice>Carregando materiais criticos...</OperationalNotice> : null}

      {!loading && !error && items.length === 0 ? (
        <OperationalNotice tone="success">
          Nenhum material abaixo do limite de alerta configurado (com quantidade planejada &gt; 0).
        </OperationalNotice>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="table-shell">
            <table className="data-table materiais-criticos-table">
              <thead>
                <tr>
                  <th className="materiais-criticos-table__codigo">Codigo</th>
                  <th className="materiais-criticos-table__desc">Descricao</th>
                  <th className="materiais-criticos-table__num">Saldo</th>
                  <th className="materiais-criticos-table__num">Planejado</th>
                  <th className="materiais-criticos-table__num">Limite (%)</th>
                  <th className="materiais-criticos-table__num">% saldo/planej.</th>
                  <th className="materiais-criticos-table__grav">Gravidade</th>
                  <th className="materiais-criticos-table__acao">Consulta</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.materialId}>
                    <td className="materiais-criticos-table__codigo">
                      <strong>{item.codigo}</strong>
                    </td>
                    <td className="materiais-criticos-table__desc">{item.descricao}</td>
                    <td className="materiais-criticos-table__num">
                      {formatDecimalExcelPtBr(item.saldoAtual)} {item.unidade}
                    </td>
                    <td className="materiais-criticos-table__num">
                      {formatDecimalExcelPtBr(item.quantidadePlanejada)} {item.unidade}
                    </td>
                    <td className="materiais-criticos-table__num">
                      {formatDecimalExcelPtBr(item.limiteAlerta)} {item.unidade}{' '}
                      <span className="materiais-consulta-table-sub">({item.percentualAlerta}%)</span>
                    </td>
                    <td className="materiais-criticos-table__num">
                      {formatDecimalExcelPtBr(item.percentualSaldoVsPlanejado)}%
                    </td>
                    <td className="materiais-criticos-table__grav">
                      <StatusBadge
                        text={item.severidade === 'critical' ? 'Critico' : 'Atencao'}
                        tone={item.severidade === 'critical' ? 'danger' : 'warning'}
                      />
                    </td>
                    <td className="materiais-criticos-table__acao">
                      <Link
                        className="ghost-button"
                        to={`/materiais?tab=consulta&q=${encodeURIComponent(item.codigo)}`}
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            itemLabel="materiais em alerta"
            onPageChange={setPage}
            page={page}
            pageSize={PAGE_SIZE}
            total={items.length}
          />
        </>
      ) : null}
    </>
  );
}
