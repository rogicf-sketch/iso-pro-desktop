import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import type { Colaborador } from '../../colaboradores/types/colaborador.types';
import type { AtendimentoRecebedorTipo } from '../types/atendimento.types';
import {
  quantidadeMaximaAtendimentoLinha,
  type AtendimentoLeitorPainelState,
} from '../hooks/useAtendimento';

type Props = {
  open: boolean;
  painel: AtendimentoLeitorPainelState | null;
  atendente: string;
  recebedorTipo: AtendimentoRecebedorTipo;
  recebedorColaboradorId: string;
  recebedor: string;
  colaboradores: Colaborador[];
  avisoRetirante?: string;
  onConfirmar: (documentoId: string, quantidade: number) => void;
  onContinuarBipando: () => void;
  onCancelar: () => void;
};

function rotuloRetirante(
  recebedorTipo: AtendimentoRecebedorTipo,
  recebedorColaboradorId: string,
  recebedor: string,
  colaboradores: Colaborador[],
): string {
  if (recebedorTipo === 'interno') {
    const c = colaboradores.find((x) => x.id === recebedorColaboradorId);
    return c?.nome?.trim() || recebedor.trim() || '— (selecione colaborador)';
  }
  return recebedor.trim() || '— (informe retirante externo)';
}

export function AtendimentoLeitorModal({
  open,
  painel,
  atendente,
  recebedorTipo,
  recebedorColaboradorId,
  recebedor,
  colaboradores,
  avisoRetirante,
  onConfirmar,
  onContinuarBipando,
  onCancelar,
}: Props) {
  const [documentoId, setDocumentoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const quantidadeRef = useRef<HTMLInputElement>(null);
  const continuarRef = useRef<HTMLButtonElement>(null);

  const candidato = useMemo(
    () => painel?.candidatos.find((c) => c.documento.id === documentoId),
    [painel, documentoId],
  );

  const candidatoConcluido = useMemo(
    () =>
      painel?.candidatos.find(
        (c) => c.documento.id === (painel.documentoSelecionadoId ?? documentoId),
      ),
    [painel, documentoId],
  );

  const maxQtd = candidato ? quantidadeMaximaAtendimentoLinha(candidato.linha) : 0;
  const concluido = painel?.passo === 'concluido';

  const confirmarInclusao = useCallback(() => {
    if (!documentoId || !candidato || maxQtd <= 0) return;
    const q = Number(quantidade.replace(',', '.'));
    onConfirmar(documentoId, q);
  }, [candidato, documentoId, maxQtd, onConfirmar, quantidade]);

  useEffect(() => {
    if (!painel || !open) return;
    const primeiro = painel.candidatos[0];
    const idInicial =
      painel.documentoSelecionadoId ?? (painel.candidatos.length === 1 ? primeiro?.documento.id : '') ?? '';
    setDocumentoId(idInicial);
    if (primeiro && idInicial === primeiro.documento.id) {
      setQuantidade(String(quantidadeMaximaAtendimentoLinha(primeiro.linha)));
    } else {
      setQuantidade('');
    }
  }, [painel?.scan, open, painel]);

  useEffect(() => {
    if (!candidato) return;
    setQuantidade(String(quantidadeMaximaAtendimentoLinha(candidato.linha)));
  }, [documentoId, candidato]);

  useEffect(() => {
    if (!open || concluido) return;
    if (candidato) {
      window.setTimeout(() => {
        quantidadeRef.current?.focus();
        quantidadeRef.current?.select();
      }, 0);
    }
  }, [open, concluido, candidato, painel?.scan]);

  useEffect(() => {
    if (!open || !concluido) return;
    window.setTimeout(() => continuarRef.current?.focus(), 0);
  }, [open, concluido, painel?.scan]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey) return;
      const alvo = event.target;
      if (alvo instanceof HTMLElement && alvo.tagName === 'BUTTON') return;

      if (concluido) {
        event.preventDefault();
        onContinuarBipando();
        return;
      }
      if (!painel || painel.candidatos.length === 0 || !candidato || maxQtd <= 0) return;
      event.preventDefault();
      confirmarInclusao();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, concluido, candidato, maxQtd, confirmarInclusao, onContinuarBipando, painel]);

  if (!painel) return null;

  const { material, candidatos, scan } = painel;

  return (
    <Modal onClose={onCancelar} open={open} title="Atendimento via leitor" wide>
      <div className="editor-block stack-grid">
        <div className="info-card" style={{ margin: 0 }}>
          <p className="panel-kicker">Retirada</p>
          <p className="panel-copy">
            <strong>Atendente:</strong> {atendente.trim() || '— (obrigatorio)'}
            <br />
            <strong>{recebedorTipo === 'interno' ? 'Colaborador atendido (quem retirou)' : 'Retirante (externo)'}:</strong>{' '}
            {rotuloRetirante(recebedorTipo, recebedorColaboradorId, recebedor, colaboradores)}
          </p>
          {avisoRetirante ? <OperationalNotice tone="warning">{avisoRetirante}</OperationalNotice> : null}
        </div>

        <div className="document-summary">
          <strong>{material.codigo}</strong>
          <p className="panel-copy">{material.descricao || 'Sem descricao no cadastro.'}</p>
          <p className="panel-copy">
            Leitura: <code>{scan}</code>
          </p>
        </div>

        {candidatos.length === 0 ? (
          <OperationalNotice tone="warning">
            Nenhum documento pendente inclui este material. Verifique planejamento, recebimento (saldo) e cadastro.
          </OperationalNotice>
        ) : concluido ? (
          <>
            <OperationalNotice tone="success">
              Material <strong>{material.codigo}</strong> incluido na sessao
              {painel.quantidadeAplicada != null && candidatoConcluido
                ? ` — ${painel.quantidadeAplicada} ${candidatoConcluido.linha.unidade}`
                : ''}
              {candidatoConcluido
                ? ` no documento ${candidatoConcluido.documento.numero} Rev. ${candidatoConcluido.documento.revisao}.`
                : '.'}
            </OperationalNotice>
            <p className="panel-copy">Deseja bipar o proximo material? (Enter = sim)</p>
            <div className="form-actions">
              <Button onClick={onContinuarBipando} ref={continuarRef} type="button">
                Sim — continuar bipando
              </Button>
              <Button onClick={onCancelar} type="button" variant="ghost">
                Nao — fechar e revisar tabela
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="panel-kicker">Desenho / documento</p>
            <ul className="stack-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {candidatos.map(({ documento, linha }) => {
                const ativo = documentoId === documento.id;
                return (
                  <li key={documento.id}>
                    <button
                      className={`button${ativo ? ' button-primary' : ' ghost-button'}`}
                      onClick={() => setDocumentoId(documento.id)}
                      style={{ width: '100%', textAlign: 'left', whiteSpace: 'normal' }}
                      type="button"
                    >
                      <strong>{documento.numero}</strong> Rev. {documento.revisao}
                      <br />
                      <span className="panel-copy">{documento.descricao}</span>
                      <br />
                      <span className="panel-copy">
                        Pendente {linha.quantidadePendente} {linha.unidade} · Saldo {linha.saldoDisponivel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {candidato ? (
              <label className="field">
                <span>
                  Quantidade nesta operacao (max. {maxQtd} {candidato.linha.unidade}) — Enter confirma
                </span>
                <input
                  className="input-control"
                  inputMode="decimal"
                  min={0}
                  max={maxQtd}
                  onChange={(e) => setQuantidade(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    confirmarInclusao();
                  }}
                  ref={quantidadeRef}
                  type="number"
                  value={quantidade}
                />
              </label>
            ) : (
              <OperationalNotice>Selecione um documento acima.</OperationalNotice>
            )}

            <div className="form-actions">
              <Button disabled={!candidato || maxQtd <= 0} onClick={confirmarInclusao} type="button">
                Incluir no atendimento
              </Button>
              <Button onClick={onCancelar} type="button" variant="ghost">
                Cancelar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
