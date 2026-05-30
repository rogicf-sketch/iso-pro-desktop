import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import type { Colaborador } from '../../colaboradores/types/colaborador.types';
import type { AtendimentoRecebedorTipo, SessaoRetiradaLinha } from '../types/atendimento.types';
import type { AtendimentoLeitorPainelState } from '../hooks/useAtendimento';
import {
  analisarQuantidadeAtendimentoLinha,
  obterQuantidadeLinhaSessao,
  quantidadeMaximaRestanteLeitor,
} from '../utils/sessaoRetirada.utils';

type Props = {
  open: boolean;
  painel: AtendimentoLeitorPainelState | null;
  sessaoRetirada: SessaoRetiradaLinha[];
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
  sessaoRetirada,
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

  const qtdNaSessao = candidato
    ? obterQuantidadeLinhaSessao(sessaoRetirada, candidato.documento.id, candidato.linha.documentoItemId)
    : 0;

  const maxQtd = candidato ? quantidadeMaximaRestanteLeitor(candidato.linha, sessaoRetirada, candidato.documento.id) : 0;
  const concluido = painel?.passo === 'concluido';
  const todosCandidatosEsgotados = useMemo(() => {
    if (!painel?.candidatos.length) return false;
    return painel.candidatos.every(
      (c) => quantidadeMaximaRestanteLeitor(c.linha, sessaoRetirada, c.documento.id) <= 0,
    );
  }, [painel, sessaoRetirada]);

  const analiseQuantidade = useMemo(() => {
    if (!candidato) {
      return { valida: false, quantidade: 0, mensagem: null as string | null };
    }
    if (maxQtd <= 0) {
      return {
        valida: false,
        quantidade: 0,
        mensagem:
          qtdNaSessao > 0
            ? `Este material ja consta na sessao com ${qtdNaSessao} ${candidato.linha.unidade} neste documento (quantidade maxima atingida).`
            : 'Nao ha quantidade pendente ou saldo disponivel para este documento.',
      };
    }
    return analisarQuantidadeAtendimentoLinha(quantidade, maxQtd, candidato.linha.unidade);
  }, [candidato, maxQtd, qtdNaSessao, quantidade]);

  const podeIncluir = Boolean(candidato && maxQtd > 0 && analiseQuantidade.valida);

  const confirmarInclusao = useCallback(() => {
    if (!documentoId || !candidato || !podeIncluir) return;
    onConfirmar(documentoId, analiseQuantidade.quantidade);
  }, [analiseQuantidade.quantidade, candidato, documentoId, onConfirmar, podeIncluir]);

  useEffect(() => {
    if (!painel || !open) return;
    const comRestante = painel.candidatos.filter(
      (c) => quantidadeMaximaRestanteLeitor(c.linha, sessaoRetirada, c.documento.id) > 0,
    );
    const preferido = comRestante[0] ?? painel.candidatos[0];
    const idInicial =
      painel.documentoSelecionadoId ??
      (painel.candidatos.length === 1 ? preferido?.documento.id : preferido?.documento.id) ??
      '';
    setDocumentoId(idInicial);
    if (preferido && idInicial === preferido.documento.id) {
      const restante = quantidadeMaximaRestanteLeitor(preferido.linha, sessaoRetirada, preferido.documento.id);
      setQuantidade(restante > 0 ? String(restante) : '');
    } else {
      setQuantidade('');
    }
  }, [painel?.scan, open, painel, sessaoRetirada]);

  useEffect(() => {
    if (!candidato) return;
    const restante = quantidadeMaximaRestanteLeitor(candidato.linha, sessaoRetirada, candidato.documento.id);
    setQuantidade(restante > 0 ? String(restante) : '');
  }, [documentoId, candidato, sessaoRetirada]);

  useEffect(() => {
    if (!open || concluido) return;
    if (candidato && maxQtd > 0) {
      window.setTimeout(() => {
        quantidadeRef.current?.focus();
        quantidadeRef.current?.select();
      }, 0);
    }
  }, [open, concluido, candidato, maxQtd, painel?.scan]);

  useEffect(() => {
    if (!open || !concluido) return;
    window.setTimeout(() => continuarRef.current?.focus(), 0);
  }, [open, concluido, painel?.scan]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelar();
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey) return;
      const alvo = event.target;
      if (alvo instanceof HTMLElement && alvo.tagName === 'BUTTON') return;

      if (concluido) {
        event.preventDefault();
        onContinuarBipando();
        return;
      }
      if (!painel || painel.candidatos.length === 0 || !podeIncluir) return;
      event.preventDefault();
      confirmarInclusao();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, concluido, podeIncluir, confirmarInclusao, onContinuarBipando, onCancelar, painel]);

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
            <p className="panel-copy">Deseja bipar o proximo material? (Enter = sim, Esc = fechar)</p>
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
            {todosCandidatosEsgotados ? (
              <OperationalNotice tone="warning">
                Material <strong>{material.codigo}</strong> ja consta na sessao de retirada com a quantidade maxima
                permitida neste(s) documento(s). Bipe outro material ou confirme a retirada na tabela abaixo.
              </OperationalNotice>
            ) : null}

            <p className="panel-kicker">Desenho / documento</p>
            <ul className="stack-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {candidatos.map(({ documento, linha }) => {
                const ativo = documentoId === documento.id;
                const naSessao = obterQuantidadeLinhaSessao(sessaoRetirada, documento.id, linha.documentoItemId);
                const restante = quantidadeMaximaRestanteLeitor(linha, sessaoRetirada, documento.id);
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
                        {naSessao > 0 ? (
                          <>
                            <br />
                            Na sessao: {naSessao} {linha.unidade} · Restante: {restante} {linha.unidade}
                          </>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {candidato ? (
              maxQtd > 0 ? (
                <>
                  <label className="field">
                    <span>
                      Quantidade nesta operacao (max. {maxQtd} {candidato.linha.unidade}
                      {qtdNaSessao > 0 ? ` — ja ha ${qtdNaSessao} na sessao` : ''}) — Enter confirma
                    </span>
                    <input
                      aria-invalid={Boolean(analiseQuantidade.mensagem)}
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
                  {analiseQuantidade.mensagem ? (
                    <OperationalNotice tone="warning">{analiseQuantidade.mensagem}</OperationalNotice>
                  ) : null}
                </>
              ) : analiseQuantidade.mensagem ? (
                <OperationalNotice tone="warning">{analiseQuantidade.mensagem}</OperationalNotice>
              ) : null
            ) : (
              <OperationalNotice>Selecione um documento acima.</OperationalNotice>
            )}

            <div className="form-actions">
              <Button disabled={!podeIncluir} onClick={confirmarInclusao} type="button">
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
