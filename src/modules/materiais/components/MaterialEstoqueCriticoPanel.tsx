import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatDecimalExcelPtBr } from '../../../lib/csv';
import { listarMateriaisCriticosEstoque, type MaterialEstoqueCritico } from '../services/materiaisEstoqueCritico.service';

export function MaterialEstoqueCriticoPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MaterialEstoqueCritico[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listarMateriaisCriticosEstoque());
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

  const criticos = items.filter((i) => i.severidade === 'critical').length;

  return (
    <div className="materiais-criticos">
      <ModuleHelp>
        <p className="panel-copy">
          Materiais ativos cujo <strong>saldo operacional</strong> esta abaixo do limite definido no cadastro (
          <strong>percentual do total planejado</strong> nos documentos). Configure o percentual em Cadastro → Editar
          material. E-mail para itens <strong>criticos</strong> em Configuracoes → Alertas; com Supabase, o envio pode
          rodar na nuvem (cron) sem PC aberto.
        </p>
      </ModuleHelp>

      <div className="materiais-consulta__search-actions" style={{ marginBottom: 16 }}>
        <Button disabled={loading} onClick={() => void load()} type="button" variant="ghost">
          {loading ? 'Atualizando...' : 'Atualizar lista'}
        </Button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {loading ? <OperationalNotice>Carregando materiais criticos...</OperationalNotice> : null}

      {!loading && !error && items.length === 0 ? (
        <OperationalNotice tone="success">
          Nenhum material abaixo do limite de alerta configurado (com quantidade planejada &gt; 0).
        </OperationalNotice>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <OperationalNotice tone={criticos > 0 ? 'critical' : 'warning'}>
            {items.length} material(is) em alerta
            {criticos > 0 ? ` (${criticos} critico(s))` : ''}.
          </OperationalNotice>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Descricao</th>
                  <th>Saldo</th>
                  <th>Planejado</th>
                  <th>Limite (%)</th>
                  <th>% saldo/planej.</th>
                  <th>Gravidade</th>
                  <th>Consulta</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.materialId}>
                    <td>
                      <strong>{item.codigo}</strong>
                    </td>
                    <td>{item.descricao}</td>
                    <td>
                      {formatDecimalExcelPtBr(item.saldoAtual)} {item.unidade}
                    </td>
                    <td>
                      {formatDecimalExcelPtBr(item.quantidadePlanejada)} {item.unidade}
                    </td>
                    <td>
                      {formatDecimalExcelPtBr(item.limiteAlerta)} {item.unidade}{' '}
                      <span className="materiais-consulta-table-sub">({item.percentualAlerta}%)</span>
                    </td>
                    <td>{formatDecimalExcelPtBr(item.percentualSaldoVsPlanejado)}%</td>
                    <td>
                      <StatusBadge
                        text={item.severidade === 'critical' ? 'Critico' : 'Atencao'}
                        tone={item.severidade === 'critical' ? 'danger' : 'warning'}
                      />
                    </td>
                    <td>
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
        </>
      ) : null}
    </div>
  );
}
