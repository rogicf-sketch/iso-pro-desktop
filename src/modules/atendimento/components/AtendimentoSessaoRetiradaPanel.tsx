import { Button } from '../../../components/ui/Button';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { agruparSessaoPorDocumento, totalUnidadesSessao } from '../utils/sessaoRetirada.utils';
import type { SessaoRetiradaLinha } from '../types/atendimento.types';

type Props = {
  linhas: SessaoRetiradaLinha[];
  podeConfirmar: boolean;
  loading: boolean;
  onConfirmar: () => void;
  onRemoverLinha: (documentoId: string, documentoItemId: string) => void;
  onLimpar: () => void;
};

export function AtendimentoSessaoRetiradaPanel({
  linhas,
  podeConfirmar,
  loading,
  onConfirmar,
  onRemoverLinha,
  onLimpar,
}: Props) {
  if (!linhas.length) return null;

  const grupos = agruparSessaoPorDocumento(linhas);
  const documentoCount = grupos.size;
  const totalUn = totalUnidadesSessao(linhas);

  return (
    <div className="section-block" style={{ borderLeft: '4px solid var(--accent, #3b82f6)' }}>
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Sessao de retirada</p>
          <h3 style={{ margin: 0 }}>Retirada em andamento</h3>
        </div>
        <div className="inline-actions">
          <Button onClick={onLimpar} type="button" variant="ghost">
            Limpar sessao
          </Button>
          <Button
            disabled={loading || !podeConfirmar}
            onClick={onConfirmar}
            title={
              !podeConfirmar && !loading
                ? 'Preencha atendente, retirante e verifique quantidades da sessao.'
                : undefined
            }
            type="button"
          >
            Confirmar retirada (recibo unico)
          </Button>
        </div>
      </div>

      <OperationalNotice>
        {documentoCount} desenho(s) · {linhas.length} item(ns) · {totalUn} unidade(s) nesta retirada. Ao confirmar, o
        sistema registra um lote por desenho e imprime um recibo consolidado com uma assinatura.
      </OperationalNotice>

      {[...grupos.entries()].map(([documentoId, grupo]) => {
        const cab = grupo[0];
        return (
          <div className="info-card" key={documentoId} style={{ marginTop: 12 }}>
            <p className="panel-copy">
              <strong>
                {cab.documentoNumero} Rev. {cab.documentoRevisao}
              </strong>
              <br />
              {cab.documentoDescricao || '—'}
            </p>
            <table className="data-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Descricao</th>
                  <th>UN</th>
                  <th>Qtd</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grupo.map((linha) => (
                  <tr key={`${linha.documentoId}-${linha.documentoItemId}`}>
                    <td>{linha.codigoMaterial}</td>
                    <td>{linha.descricaoMaterial}</td>
                    <td>{linha.unidade}</td>
                    <td>{linha.quantidade}</td>
                    <td>
                      <Button
                        onClick={() => onRemoverLinha(linha.documentoId, linha.documentoItemId)}
                        type="button"
                        variant="ghost"
                      >
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
