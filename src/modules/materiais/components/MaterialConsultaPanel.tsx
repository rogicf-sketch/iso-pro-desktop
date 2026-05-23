import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { formatDecimalExcelPtBr } from '../../../lib/csv';
import { consultarMaterialPorCodigo } from '../services/consultaMaterial.service';
import type { ConsultaMaterialResult } from '../types/consultaMaterial.types';

type Props = {
  /** Codigo inicial (URL ou Ctrl+K). */
  initialQuery?: string;
  /** Dispara consulta automaticamente quando `initialQuery` muda. */
  autoSearch?: boolean;
};

const INPUT_ID = 'materiais-consulta-codigo-input';

function statusTone(
  status: string,
): 'neutral' | 'ok' | 'warning' | 'danger' {
  if (status === 'atendido' || status === 'concluido') return 'ok';
  if (status === 'recebido' || status === 'parcial') return 'warning';
  if (status === 'estornado' || status === 'cancelado') return 'danger';
  return 'neutral';
}

function formatDataPt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MaterialConsultaPanel({ initialQuery = '', autoSearch = false }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConsultaMaterialResult | null>(null);
  const lastAutoRef = useRef('');

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) {
      setError('Informe um codigo para consultar.');
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await consultarMaterialPorCodigo(q);
      if (!r.success) {
        setError(r.error ?? 'Falha na consulta.');
        setResult(null);
        return;
      }
      setResult(r.data ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!autoSearch) return;
    const q = initialQuery.trim();
    if (!q || q === lastAutoRef.current) return;
    lastAutoRef.current = q;
    void runSearch(q);
  }, [autoSearch, initialQuery, runSearch]);

  useEffect(() => {
    document.getElementById(INPUT_ID)?.focus();
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void runSearch(query);
  }

  return (
    <div className="materiais-consulta">
      <ModuleHelp>
        <p className="panel-copy">
          Consulta rapida por codigo ou codigo de barras: saldo operacional, linhas em planejamento (atendido / pendente) e
          ultimos lotes de atendimento. Somente leitura — nao altera cadastro nem movimentos. Atalho global:{' '}
          <kbd>Ctrl+K</kbd> (ou <kbd>Cmd+K</kbd> no Mac).
        </p>
      </ModuleHelp>

      <form className="materiais-consulta__search" onSubmit={handleSubmit}>
        <Input
          id={INPUT_ID}
          label="Codigo ou codigo de barras"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite ou bip o codigo e pressione Enter"
          value={query}
        />
        <div className="materiais-consulta__search-actions">
          <Button disabled={loading} type="submit">
            {loading ? 'Consultando...' : 'Consultar'}
          </Button>
        </div>
      </form>

      {error ? (
        <div className="error-box" style={{ whiteSpace: 'pre-line' }}>
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="materiais-consulta__result">
          <section className="materiais-consulta-card">
            <p className="panel-kicker">Material</p>
            {result.material ? (
              <>
                <h3 className="materiais-consulta-card__title">
                  {result.material.codigo}
                  {!result.material.ativo ? <StatusBadge text="Inativo" tone="danger" /> : null}
                </h3>
                <p className="panel-copy">{result.material.descricao}</p>
                <dl className="materiais-consulta-dl">
                  <div>
                    <dt>Disciplina</dt>
                    <dd>{result.material.disciplina || '—'}</dd>
                  </div>
                  <div>
                    <dt>Unidade</dt>
                    <dd>{result.material.unidade || '—'}</dd>
                  </div>
                  <div>
                    <dt>Saldo operacional</dt>
                    <dd>
                      <strong>
                        {result.saldoAtual != null
                          ? `${formatDecimalExcelPtBr(result.saldoAtual)} ${result.material.unidade}`
                          : '—'}
                      </strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Alerta estoque (% planej.)</dt>
                    <dd>
                      {result.percentualAlerta > 0 ? (
                        <>
                          <strong>{result.percentualAlerta}%</strong>
                          {result.limiteAlerta != null ? (
                            <span className="materiais-consulta-table-sub">
                              {' '}
                              — limite {formatDecimalExcelPtBr(result.limiteAlerta)} {result.material.unidade} (planejado{' '}
                              {formatDecimalExcelPtBr(result.quantidadePlanejada)})
                            </span>
                          ) : null}
                          {result.emAlertaEstoque ? (
                            <StatusBadge text="Em alerta" tone="warning" />
                          ) : null}
                        </>
                      ) : (
                        'Desligado (0%)'
                      )}
                    </dd>
                  </div>
                  {result.statusGlobalLabel ? (
                    <div>
                      <dt>Status global (planejamento)</dt>
                      <dd>
                        <StatusBadge text={result.statusGlobalLabel} tone={statusTone(result.statusGlobal ?? 'pendente')} />
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </>
            ) : (
              <>
                <h3 className="materiais-consulta-card__title">Codigo {result.codigoConsultado}</h3>
                <OperationalNotice tone="warning">
                  Nao encontrado no cadastro de materiais (ou inativo sem correspondencia). Ainda assim, confira
                  planejamento e atendimentos abaixo.
                </OperationalNotice>
                {result.saldoAtual != null ? (
                  <p className="panel-copy">
                    Saldo no movimento: <strong>{formatDecimalExcelPtBr(result.saldoAtual)}</strong>
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section className="materiais-consulta-card">
            <div className="materiais-consulta-card__head">
              <div>
                <p className="panel-kicker">Planejamento</p>
                <h3>Documentos com este codigo</h3>
              </div>
              <Link className="ghost-button" to="/documentos">
                Abrir planejamento
              </Link>
            </div>
            {result.documentos.length === 0 ? (
              <p className="panel-copy">Nenhuma linha de planejamento com este codigo.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Rev.</th>
                      <th>Qtd doc.</th>
                      <th>Atendida</th>
                      <th>Pendente</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.documentos.map((linha) => (
                      <tr key={`${linha.documentoId}-${linha.quantidadeProjeto}-${linha.quantidadeAtendida}`}>
                        <td>
                          <strong>{linha.numero}</strong>
                          <span className="materiais-consulta-table-sub">{linha.descricao}</span>
                        </td>
                        <td>{linha.revisao}</td>
                        <td>{formatDecimalExcelPtBr(linha.quantidadeProjeto)}</td>
                        <td>{formatDecimalExcelPtBr(linha.quantidadeAtendida)}</td>
                        <td>{formatDecimalExcelPtBr(linha.quantidadePendente)}</td>
                        <td>
                          <StatusBadge text={linha.statusLabel} tone={statusTone(linha.statusLinha)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="materiais-consulta-card">
            <div className="materiais-consulta-card__head">
              <div>
                <p className="panel-kicker">Atendimento</p>
                <h3>Ultimos lotes (retiradas)</h3>
              </div>
              <Link className="ghost-button" to="/atendimento">
                Abrir atendimento
              </Link>
            </div>
            {result.lotes.length === 0 ? (
              <p className="panel-copy">Nenhum lote registrado com este codigo.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Data</th>
                      <th>Documento</th>
                      <th>Qtd</th>
                      <th>Retirante</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lotes.map((lote) => (
                      <tr key={`${lote.atendimentoId}-${lote.quantidade}`}>
                        <td>{lote.numero}</td>
                        <td>{formatDataPt(lote.dataAtendimento)}</td>
                        <td>{lote.documentoNumero}</td>
                        <td>
                          {formatDecimalExcelPtBr(lote.quantidade)} {lote.unidade}
                        </td>
                        <td>
                          {lote.recebedor}
                          <span className="materiais-consulta-table-sub">Atendente: {lote.atendente}</span>
                        </td>
                        <td>
                          <StatusBadge
                            text={lote.status === 'estornado' ? 'Estornado' : 'Concluido'}
                            tone={statusTone(lote.status)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
